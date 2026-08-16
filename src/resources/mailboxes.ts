import { type ClientContext, request } from "../http.js";
import type {
  HealthResponse,
  MailboxList,
  MailboxSummary,
  RequestOptions,
} from "../types.js";

function requireMailboxId(mailboxId: string | undefined): string {
  if (!mailboxId) {
    throw new TypeError("mailboxId is required");
  }
  return mailboxId;
}

export function mailboxPrefix(mailboxId: string): string {
  return `/mailboxes/${encodeURIComponent(requireMailboxId(mailboxId))}`;
}

/** `GET /mailboxes` and `GET /mailboxes/{id}`. */
export class MailboxesResource {
  constructor(private readonly context: ClientContext) {}

  /** Inboxes this API key may see. Empty key scope means all current and future inboxes. */
  list(options: RequestOptions = {}): Promise<MailboxList> {
    return request<MailboxList>(this.context, {
      method: "GET",
      path: "/mailboxes",
      ...options,
    });
  }

  /** Summary counts for one mailbox UUID. */
  get(mailboxId: string, options: RequestOptions = {}): Promise<MailboxSummary> {
    return request<MailboxSummary>(this.context, {
      method: "GET",
      path: mailboxPrefix(mailboxId),
      ...options,
    });
  }
}

/** Liveness probe. Requires no authentication. */
export function health(
  context: ClientContext,
  options: RequestOptions = {},
): Promise<HealthResponse> {
  return request<HealthResponse>(context, {
    method: "GET",
    path: "/health",
    auth: false,
    ...options,
  });
}
