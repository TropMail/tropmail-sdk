import { MarkdownTimeoutError } from "../errors.js";
import { type ClientContext, request } from "../http.js";
import { sleep } from "../throttle.js";
import {
  type ActionStatus,
  type DownloadResponse,
  type EmailActionResult,
  type EmailDetail,
  type EmailListItem,
  type EmailListResponse,
  type EmailRef,
  type EmailState,
  type EmailUpdateBody,
  type GetEmailOptions,
  type GetMarkdownOptions,
  type IterateEmailsOptions,
  type ListEmailsOptions,
  type RequestOptions,
  type ScanResponse,
  type SearchEmailsOptions,
  type UpdateEmailOptions,
  resolveEmailRef,
  resolveTimestamp,
} from "../types.js";

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_ITERATE_PAGE_SIZE = 100;

/** Endpoints under `/emails` and `/email/{id}`. */
export class EmailsResource {
  constructor(private readonly context: ClientContext) {}

  /** Return one page of emails. */
  list(options: ListEmailsOptions = {}): Promise<EmailListResponse> {
    const { limit = DEFAULT_PAGE_SIZE, page = 1, status = "all", ...rest } = options;
    return request<EmailListResponse>(this.context, {
      method: "POST",
      path: "/emails",
      body: { limit, page, status },
      ...rest,
    });
  }

  /** Full-text search. The API always reports `total: 0` for search. */
  search(options: SearchEmailsOptions): Promise<EmailListResponse> {
    const { query, limit = DEFAULT_PAGE_SIZE, page = 1, ...rest } = options;
    return request<EmailListResponse>(this.context, {
      method: "POST",
      path: "/emails/search",
      body: { query, limit, page },
      ...rest,
    });
  }

  /**
   * Yield every email, paging automatically.
   *
   * Stops on the first short page: `total` counts the whole mailbox and cannot
   * be used to detect the end of a filtered result set.
   */
  async *iterate(options: IterateEmailsOptions = {}): AsyncGenerator<EmailListItem> {
    const { limit = DEFAULT_ITERATE_PAGE_SIZE, status = "all", ...rest } = options;
    for (let page = 1; ; page += 1) {
      const result = await this.list({ limit, page, status, ...rest });
      yield* result.emails;
      if (result.emails.length < limit) {
        return;
      }
    }
  }

  /** Yield every search hit, paging automatically. */
  async *searchIterate(
    query: string,
    options: Omit<IterateEmailsOptions, "status"> = {},
  ): AsyncGenerator<EmailListItem> {
    const { limit = DEFAULT_ITERATE_PAGE_SIZE, ...rest } = options;
    for (let page = 1; ; page += 1) {
      const result = await this.search({ query, limit, page, ...rest });
      yield* result.emails;
      if (result.emails.length < limit) {
        return;
      }
    }
  }

  /**
   * Fetch a single email in the requested view.
   *
   * Pass the email object you already have rather than a bare id; the SDK
   * forwards its timestamp so the lookup is faster.
   */
  get(ref: EmailRef, options: GetEmailOptions = {}): Promise<EmailDetail> {
    const { view = "html", timestamp, ...rest } = options;
    const { id } = resolveEmailRef(ref);
    const ts = resolveTimestamp(ref, timestamp);
    return request<EmailDetail>(this.context, {
      method: "GET",
      path: view === "html" ? `/email/${id}` : `/email/${id}/${view}`,
      query: ts ? { timestamp: ts } : undefined,
      ...rest,
    });
  }

  /**
   * Fetch the markdown view, retrying the 504 the conversion can return.
   *
   * The server blocks up to ~60s while converting, then answers 504 and expects
   * the same GET to be retried.
   */
  async getMarkdown(ref: EmailRef, options: GetMarkdownOptions = {}): Promise<EmailDetail> {
    const { timestamp, ...rest } = options;
    const { id } = resolveEmailRef(ref);
    const ts = resolveTimestamp(ref, timestamp);
    const attempts = this.context.config.maxRetries + 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await request<EmailDetail>(this.context, {
          method: "GET",
          path: `/email/${id}/markdown`,
          query: ts ? { timestamp: ts } : undefined,
          retry: false,
          ...rest,
        });
      } catch (error) {
        if (!(error instanceof MarkdownTimeoutError) || attempt >= attempts - 1) {
          throw error;
        }
        await sleep(Math.random() * Math.min(30_000, 500 * 2 ** attempt));
      }
    }
    throw new MarkdownTimeoutError("Markdown conversion timed out", 504);
  }

  /**
   * Update `email_state` and/or `action_status`.
   *
   * Pass `actionStatus: ""` to clear a previous action.
   */
  update(ref: EmailRef, options: UpdateEmailOptions): Promise<EmailActionResult> {
    const { emailState, actionStatus, timestamp, ...rest } = options;
    if (emailState === undefined && actionStatus === undefined) {
      return Promise.reject(
        new TypeError("Provide at least one of emailState or actionStatus"),
      );
    }
    const { id } = resolveEmailRef(ref);
    const ts = resolveTimestamp(ref, timestamp);
    const body: EmailUpdateBody = {};
    if (emailState !== undefined) {
      body.email_state = emailState;
    }
    if (actionStatus !== undefined) {
      body.action_status = actionStatus;
    }
    if (ts !== undefined) {
      body.timestamp = ts;
    }
    return request<EmailActionResult>(this.context, {
      method: "POST",
      path: `/email/${id}`,
      body: body as unknown as Record<string, unknown>,
      retry: false,
      ...rest,
    });
  }

  /** Mark an email as opened. */
  open(ref: EmailRef, options: RequestOptions = {}): Promise<EmailActionResult> {
    return this.update(ref, { emailState: "Open", ...options });
  }

  /** Mark an email as closed. */
  close(ref: EmailRef, options: RequestOptions = {}): Promise<EmailActionResult> {
    return this.update(ref, { emailState: "Close", ...options });
  }

  /** Flag an email as a favorite. */
  favorite(ref: EmailRef, options: RequestOptions = {}): Promise<EmailActionResult> {
    return this.setAction(ref, "Favorite", options);
  }

  /** Block the sender and stop future inbound mail from them. */
  block(ref: EmailRef, options: RequestOptions = {}): Promise<EmailActionResult> {
    return this.setAction(ref, "Block", options);
  }

  /** Soft-delete an email. */
  delete(ref: EmailRef, options: RequestOptions = {}): Promise<EmailActionResult> {
    return this.setAction(ref, "Delete", options);
  }

  /** Clear any action status, unblocking the sender if it was blocked. */
  clearAction(ref: EmailRef, options: RequestOptions = {}): Promise<EmailActionResult> {
    return this.setAction(ref, "", options);
  }

  /** Set an arbitrary action status. */
  setAction(
    ref: EmailRef,
    actionStatus: ActionStatus | "",
    options: RequestOptions = {},
  ): Promise<EmailActionResult> {
    return this.update(ref, { actionStatus, ...options });
  }

  /** Set an arbitrary email state. */
  setState(
    ref: EmailRef,
    emailState: EmailState,
    options: RequestOptions = {},
  ): Promise<EmailActionResult> {
    return this.update(ref, { emailState, ...options });
  }

  /** Kick off scans for every unscanned attachment on an email. */
  scanAttachments(ref: EmailRef, options: RequestOptions = {}): Promise<ScanResponse[]> {
    const { id } = resolveEmailRef(ref);
    return request<ScanResponse[]>(this.context, {
      method: "POST",
      path: `/email/${id}/scan-attachments`,
      retry: false,
      ...options,
    });
  }

  /**
   * List attachments on an email for authenticated download.
   * Fetch bytes with `client.attachments.download(attachment_id)`.
   */
  downloadAttachments(
    ref: EmailRef,
    options: RequestOptions = {},
  ): Promise<DownloadResponse[]> {
    const { id } = resolveEmailRef(ref);
    return request<DownloadResponse[]>(this.context, {
      method: "GET",
      path: `/email/${id}/download-attachments`,
      ...options,
    });
  }
}
