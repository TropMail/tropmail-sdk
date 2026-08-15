/**
 * Official TypeScript SDK for the TropMail API.
 *
 * @example
 * ```ts
 * import { TropMail } from "@tropmail/sdk";
 *
 * const client = new TropMail({ apiKey: process.env.TROPMAIL_API_KEY! });
 * const mailbox = await client.mailbox.get();
 * ```
 *
 * @packageDocumentation
 */

export {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  TropMail,
} from "./client.js";

export {
  AuthenticationError,
  ConnectionError,
  MarkdownTimeoutError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TierError,
  TropMailError,
  ValidationError,
} from "./errors.js";

export { validateApiKey } from "./auth.js";

export type { RateLimitSnapshot } from "./rate-limit.js";

export { MailboxResource } from "./resources/mailbox.js";
export { EmailsResource } from "./resources/emails.js";
export { AttachmentsResource } from "./resources/attachments.js";

export type {
  ActionStatus,
  ApiEnvelope,
  Attachment,
  AttachmentMetadata,
  DownloadResponse,
  EmailActionResult,
  EmailAddress,
  EmailDetail,
  EmailListItem,
  EmailListResponse,
  EmailRef,
  EmailState,
  EmailUpdateBody,
  EmailView,
  GetEmailOptions,
  GetMarkdownOptions,
  HealthResponse,
  IterateEmailsOptions,
  ListEmailsOptions,
  ListStatus,
  MailboxSummary,
  RequestOptions,
  ScanEngineResult,
  ScanFileHashes,
  ScanReport,
  ScanResponse,
  ScanStatus,
  SearchEmailsOptions,
  Tier,
  TropMailOptions,
  UpdateEmailOptions,
  ValidateResponse,
} from "./types.js";
