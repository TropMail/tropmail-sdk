import { type ClientContext, request, requestBinary } from "../http.js";
import type {
  AttachmentMetadata,
  RequestOptions,
  ScanResponse,
} from "../types.js";

/** Endpoints under `/attachment/{id}`. */
export class AttachmentsResource {
  constructor(private readonly context: ClientContext) {}

  /** Fetch attachment metadata. */
  get(attachmentId: string, options: RequestOptions = {}): Promise<AttachmentMetadata> {
    return request<AttachmentMetadata>(this.context, {
      method: "GET",
      path: `/attachment/${attachmentId}`,
      ...options,
    });
  }

  /** Trigger a malware scan, or return the cached result when already scanned. */
  scan(attachmentId: string, options: RequestOptions = {}): Promise<ScanResponse> {
    return request<ScanResponse>(this.context, {
      method: "POST",
      path: `/attachment/${attachmentId}/scan`,
      retry: false,
      ...options,
    });
  }

  /**
   * Stream attachment bytes from `GET /attachment/{id}/download` (Bearer auth).
   * Returns the raw `Response` so callers can write to disk or a Blob.
   */
  download(attachmentId: string, options: RequestOptions = {}): Promise<Response> {
    return requestBinary(this.context, {
      method: "GET",
      path: `/attachment/${attachmentId}/download`,
      ...options,
    });
  }

  /** Alias for {@link download}. */
  fetchContent(attachmentId: string, options: RequestOptions = {}): Promise<Response> {
    return this.download(attachmentId, options);
  }

  /** Fetch the attachment bytes as an `ArrayBuffer`. */
  async downloadBytes(
    attachmentId: string,
    options: RequestOptions = {},
  ): Promise<ArrayBuffer> {
    const response = await this.download(attachmentId, options);
    return response.arrayBuffer();
  }
}
