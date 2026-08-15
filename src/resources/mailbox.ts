import { type ClientContext, request } from "../http.js";
import type {
  HealthResponse,
  MailboxSummary,
  RequestOptions,
  ValidateResponse,
} from "../types.js";

/** `GET /mailbox`, `GET /validate` and `GET /health`. */
export class MailboxResource {
  constructor(private readonly context: ClientContext) {}

  /** Return the mailbox summary for the authenticated key. */
  get(options: RequestOptions = {}): Promise<MailboxSummary> {
    return request<MailboxSummary>(this.context, {
      method: "GET",
      path: "/mailbox",
      ...options,
    });
  }

  /** Confirm the API key and learn its mailbox id and tier. */
  validate(options: RequestOptions = {}): Promise<ValidateResponse> {
    return request<ValidateResponse>(this.context, {
      method: "GET",
      path: "/validate",
      ...options,
    });
  }

  /** Liveness probe. Requires no authentication. */
  health(options: RequestOptions = {}): Promise<HealthResponse> {
    return request<HealthResponse>(this.context, {
      method: "GET",
      path: "/health",
      auth: false,
      ...options,
    });
  }
}
