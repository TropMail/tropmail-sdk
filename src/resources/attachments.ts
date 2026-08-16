import { mailboxPrefix } from "./mailboxes.js";
import { type ClientContext, request, requestBinary } from "../http.js";
import type {
  AttachmentMetadata,
  RequestOptions,
  ScanResponse,
} from "../types.js";

function attachmentPath(mailboxId: string, attachmentId: string, extra?: string): string {
  const base = `${mailboxPrefix(mailboxId)}/attachments/${encodeURIComponent(attachmentId)}`;
  return extra ? `${base}/${extra}` : base;
}

/** Endpoints under `/mailboxes/{id}/attachments/{attId}`. */
export class AttachmentsResource {
  constructor(private readonly context: ClientContext) {}

  /** Fetch attachment metadata. */
  get(
    mailboxId: string,
    attachmentId: string,
    options: RequestOptions = {},
  ): Promise<AttachmentMetadata> {
    return request<AttachmentMetadata>(this.context, {
      method: "GET",
      path: attachmentPath(mailboxId, attachmentId),
      ...options,
    });
  }

  /** Trigger a malware scan, or return the cached result when already scanned. */
  scan(
    mailboxId: string,
    attachmentId: string,
    options: RequestOptions = {},
  ): Promise<ScanResponse> {
    return request<ScanResponse>(this.context, {
      method: "POST",
      path: attachmentPath(mailboxId, attachmentId, "scan"),
      retry: false,
      ...options,
    });
  }

  /**
   * Stream attachment bytes from authenticated `GET .../download`.
   * Returns the raw `Response` so callers can write to disk or a Blob.
   */
  download(
    mailboxId: string,
    attachmentId: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    return requestBinary(this.context, {
      method: "GET",
      path: attachmentPath(mailboxId, attachmentId, "download"),
      ...options,
    });
  }

  /** Alias for {@link download}. */
  fetchContent(
    mailboxId: string,
    attachmentId: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    return this.download(mailboxId, attachmentId, options);
  }

  /** Fetch the attachment bytes as an `ArrayBuffer`. */
  async downloadBytes(
    mailboxId: string,
    attachmentId: string,
    options: RequestOptions = {},
  ): Promise<ArrayBuffer> {
    const response = await this.download(mailboxId, attachmentId, options);
    return response.arrayBuffer();
  }
}
