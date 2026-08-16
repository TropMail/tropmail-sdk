import { resolveApiKey } from "./auth.js";
import type { ClientContext } from "./http.js";
import { RateLimitTracker, type RateLimitSnapshot } from "./rate-limit.js";
import { AttachmentsResource } from "./resources/attachments.js";
import { EmailsResource } from "./resources/emails.js";
import { MailboxesResource, health } from "./resources/mailboxes.js";
import { TokenBucket } from "./throttle.js";
import type { RequestOptions, TropMailOptions } from "./types.js";

export const DEFAULT_BASE_URL = "https://api.tropmail.com/api/v1";
/** The markdown view can block for ~60s server-side. */
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Client for the TropMail API.
 *
 * Runs anywhere `fetch` exists: Node 18+, Bun, Deno, and browsers.
 * No runtime dependencies.
 *
 * @example
 * ```ts
 * const client = new TropMail({ apiKey: process.env.TROPMAIL_API_KEY! });
 * const { mailboxes } = await client.mailboxes.list();
 * for await (const email of client.emails.iterate({ mailboxId: mailboxes[0].id, status: "Open" })) {
 *   console.log(email.subject);
 * }
 * ```
 */
export class TropMail {
  readonly mailboxes: MailboxesResource;
  readonly emails: EmailsResource;
  readonly attachments: AttachmentsResource;

  private readonly context: ClientContext;

  /**
   * @param options Omit entirely to read the key from `TROPMAIL_API_KEY`.
   *   Workers and browsers have no environment, so they must pass `apiKey`.
   */
  constructor(options: TropMailOptions = {}) {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError(
        "No global fetch found. Use Node 18+, or pass a fetch implementation.",
      );
    }

    this.context = {
      config: {
        apiKey: resolveApiKey(options.apiKey),
        baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
        timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
        maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
        // Bind so implementations that check `this` (undici, workerd) stay happy.
        fetch: fetchImpl.bind(globalThis),
      },
      rateLimit: new RateLimitTracker(),
      bucket: options.throttle === false ? null : new TokenBucket(),
    };

    this.mailboxes = new MailboxesResource(this.context);
    this.emails = new EmailsResource(this.context);
    this.attachments = new AttachmentsResource(this.context);
  }

  health(options: RequestOptions = {}) {
    return health(this.context, options);
  }

  /** Rate-limit window reported by the most recent response. */
  get rateLimit(): RateLimitSnapshot {
    return this.context.rateLimit.current;
  }

  get baseUrl(): string {
    return this.context.config.baseUrl;
  }
}
