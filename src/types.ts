/** Canonical email state values returned by the API. */
export type EmailState = "Open" | "Close";

/** Canonical action status values returned by the API. */
export type ActionStatus =
  | "Favorite"
  | "Delete"
  | "Block"
  | "Phishing"
  | "Scam"
  | "Malicious";

/** Content view for email detail endpoints. */
export type EmailView = "text" | "html" | "markdown";

/** Filter values for list/search endpoints. */
export type ListStatus = "all" | EmailState | ActionStatus;

/** Virus scan status for attachments. */
export type ScanStatus =
  | "NotScanned"
  | "Processing"
  | "Clean"
  | "Malicious"
  | "Suspicious"
  | "Unknown";

/** Account tier returned by validate. */
export type Tier = "Basic" | "Pro" | "Ultimate" | "Enterprise";

/** Email address object used across list and detail responses. */
export interface EmailAddress {
  name: string;
  address: string;
}

/** Email list item — keys match the API wire format exactly. */
export interface EmailListItem {
  id: string;
  timestamp: string;
  subject: string;
  from: EmailAddress;
  body: string;
  attachmentsCount: number;
  email_state: EmailState;
  /** Omitted by the API when no action is set. */
  action_status?: ActionStatus | null;
  status: string;
}

/** File hashes captured during malware scan. */
export interface ScanFileHashes {
  sha256?: string;
  sha1?: string;
  md5?: string;
}

/** One AV engine verdict inside a ScanReport. */
export interface ScanEngineResult {
  engine: string;
  category: "harmless" | "malicious" | "suspicious" | "undetected" | "timeout";
  result: string | null;
}

/** Shaped malware report stored in scan_result (no provider branding). */
export interface ScanReport {
  status: ScanStatus;
  scannedAt: string;
  stats: {
    harmless: number;
    malicious: number;
    suspicious: number;
    undetected: number;
  };
  engines: ScanEngineResult[];
  hashes?: ScanFileHashes;
  error?: string;
}

/** Embedded attachment in email detail. */
export interface Attachment {
  attachment_id: string;
  filename?: string;
  size?: number;
  mime_type?: string;
  scan_status: ScanStatus;
  scan_result?: ScanReport;
  scanned_at?: string | null;
}

/**
 * Full email detail response.
 *
 * Deliberately not an extension of {@link EmailListItem}: detail responses carry
 * `content` instead of the `body` preview and have no `attachmentsCount`.
 */
export interface EmailDetail {
  id: string;
  timestamp: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  content: string;
  email_state: EmailState;
  action_status?: ActionStatus | null;
  status: string;
  attachments: Attachment[];
  headers: Record<string, unknown>;
  security: Record<string, unknown>;
}

/**
 * Result of an email action.
 *
 * The API echoes only the fields that changed, and a `Block` action returns
 * `sender_email` instead of `email_id`.
 */
export interface EmailActionResult {
  email_id?: string;
  email_state?: EmailState;
  action_status?: ActionStatus | null;
  sender_email?: string;
}

/** Paginated email list response. */
export interface EmailListResponse {
  emails: EmailListItem[];
  total: number;
  limit: number;
  page: number;
}

/** Mailbox summary response. */
export interface MailboxSummary {
  id: string;
  email: string;
  opened_count: number;
  closed_count: number;
  favorite_count: number;
}

/** Validate response. */
export interface ValidateResponse {
  mailbox_id: string;
  tier: Tier;
}

/** Health check response. */
export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

/** Attachment metadata response. */
export interface AttachmentMetadata {
  attachment_id: string;
  email_id: string;
  filename?: string;
  size?: number;
  mime_type?: string;
  scan_status: ScanStatus;
  scan_result?: ScanReport;
  scanned_at?: string | null;
  created_at?: string;
}

/** Scan operation response. */
export interface ScanResponse {
  status: string;
  message?: string;
  attachment_id: string;
  email_id: string;
  filename?: string;
  size?: number;
  mime_type?: string;
  scan_status: ScanStatus;
  scanned_at?: string | null;
}

/**
 * Metadata from `GET /email/{id}/download-attachments`.
 * Fetch bytes with `attachments.download(attachment_id)`.
 */
export interface DownloadResponse {
  attachment_id: string;
  email_id: string;
  filename?: string;
  size?: number;
  mime_type?: string;
  scan_status: ScanStatus;
  scanned_at?: string | null;
  available: boolean;
  message?: string;
}

/** Standard API envelope (internal). */
export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T | null;
  error: string | null;
}

/** Email update request body. */
export interface EmailUpdateBody {
  email_state?: EmailState;
  action_status?: ActionStatus | "";
  timestamp?: string;
}

/** Reference to an email by id with optional timestamp from list/detail. */
export type EmailRef = string | { id: string; timestamp?: string };

/** Common request options accepted by most SDK methods. */
export interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
}

/** Options for listing emails. */
export interface ListEmailsOptions extends RequestOptions {
  limit?: number;
  page?: number;
  status?: ListStatus;
}

/** Options for searching emails. */
export interface SearchEmailsOptions extends RequestOptions {
  query: string;
  limit?: number;
  page?: number;
}

/** Options for iterating emails. */
export interface IterateEmailsOptions extends RequestOptions {
  status?: ListStatus;
  limit?: number;
}

/** Options for getting email detail. */
export interface GetEmailOptions extends RequestOptions {
  view?: EmailView;
  timestamp?: string;
}

/** Options for getMarkdown helper. */
export interface GetMarkdownOptions extends RequestOptions {
  timestamp?: string;
}

/** Options for updating an email. */
export interface UpdateEmailOptions extends RequestOptions {
  emailState?: EmailState;
  actionStatus?: ActionStatus | "";
  timestamp?: string;
}

/** Client configuration. */
export interface TropMailOptions {
  /** 32-character API key. Falls back to `TROPMAIL_API_KEY` where available. */
  apiKey?: string;
  baseUrl?: string;
  /** Per-request timeout in milliseconds. */
  timeout?: number;
  maxRetries?: number;
  /** Pace requests to the tier budget advertised by the server. Defaults to true. */
  throttle?: boolean;
  fetch?: typeof fetch;
}

/** Resolved internal client configuration. */
export interface ResolvedClientConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  fetch: typeof fetch;
}

/** Extract id and optional timestamp from an EmailRef. */
export function resolveEmailRef(ref: EmailRef): { id: string; timestamp?: string } {
  if (typeof ref === "string") {
    return { id: ref };
  }
  return { id: ref.id, timestamp: ref.timestamp };
}

/** Extract timestamp from an email-like object or ref. */
export function resolveTimestamp(
  ref: EmailRef,
  explicit?: string,
): string | undefined {
  if (explicit !== undefined) {
    return explicit;
  }
  if (typeof ref !== "string" && ref.timestamp !== undefined) {
    return ref.timestamp;
  }
  return undefined;
}
