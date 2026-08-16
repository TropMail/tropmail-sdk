import { ConnectionError, TropMailError, createErrorFromStatus } from "./errors.js";
import { RateLimitTracker } from "./rate-limit.js";
import { TokenBucket, sleep } from "./throttle.js";
import type { ApiEnvelope, ResolvedClientConfig } from "./types.js";
import { VERSION } from "./version.js";

const USER_AGENT = `@tropmail/sdk/${VERSION}`;

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/** Internal description of a single API call. */
export interface RequestSpec {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | undefined>;
  auth?: boolean;
  retry?: boolean;
  signal?: AbortSignal;
  timeout?: number;
}

/** Per-client mutable state shared with the resource classes. */
export interface ClientContext {
  config: ResolvedClientConfig;
  rateLimit: RateLimitTracker;
  bucket: TokenBucket | null;
}

function fullJitterDelay(attempt: number, base = 500, cap = 30_000): number {
  return Math.random() * Math.min(cap, base * 2 ** attempt);
}

function isRetryable(spec: RequestSpec): boolean {
  if (spec.retry === false) {
    return false;
  }
  if (spec.method === "GET") {
    return true;
  }
  return false;
}

/** Build a full request URL from base + path + query. */
export function buildUrl(baseUrl: string, spec: RequestSpec): string {
  const url = `${baseUrl}${spec.path}`;
  if (!spec.query) {
    return url;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(spec.query)) {
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Combine a caller signal with a timeout.
 *
 * Hand-rolled rather than `AbortSignal.any`, which is unavailable on Node 18.
 */
/** Combine a caller signal with a timeout (Node 18–safe). */
export function withTimeout(
  timeout: number,
  external?: AbortSignal,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const onAbort = (): void => controller.abort(external?.reason);

  if (external) {
    if (external.aborted) {
      controller.abort(external.reason);
    } else {
      external.addEventListener("abort", onAbort, { once: true });
    }
  }

  const timer =
    timeout > 0
      ? setTimeout(() => controller.abort(new Error(`Request timed out after ${timeout}ms`)), timeout)
      : undefined;

  return {
    signal: controller.signal,
    dispose: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      external?.removeEventListener("abort", onAbort);
    },
  };
}

function randomRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readEnvelope<T>(
  response: Response,
): Promise<{ envelope: ApiEnvelope<T> | null; text: string }> {
  const text = await response.text();
  if (text === "") {
    return { envelope: null, text };
  }
  try {
    return { envelope: JSON.parse(text) as ApiEnvelope<T>, text };
  } catch {
    // Unknown protected routes answer with plain text rather than the envelope.
    return { envelope: null, text };
  }
}

function errorMessage(envelope: ApiEnvelope<unknown> | null, text: string, status: number): string {
  if (envelope) {
    if (envelope.message) {
      return envelope.message;
    }
    if (typeof envelope.error === "string" && envelope.error) {
      return envelope.error;
    }
  }
  return text.trim() || `HTTP ${status}`;
}

/** Perform a request, unwrap the envelope, and return typed `data`. */
export async function request<T>(context: ClientContext, spec: RequestSpec): Promise<T> {
  const { config } = context;
  const url = buildUrl(config.baseUrl, spec);
  const retryable = isRetryable(spec);
  const attempts = retryable ? config.maxRetries + 1 : 1;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
    "X-Request-ID": randomRequestId(),
  };
  if (spec.auth !== false) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  if (spec.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const payload = spec.body === undefined ? undefined : JSON.stringify(spec.body);
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (context.bucket) {
      await context.bucket.acquire();
    }

    const { signal, dispose } = withTimeout(spec.timeout ?? config.timeout, spec.signal);
    let response: Response;
    try {
      response = await config.fetch(url, {
        method: spec.method,
        headers,
        body: payload,
        signal,
      });
    } catch (cause) {
      dispose();
      if (spec.signal?.aborted) {
        throw new ConnectionError("Request aborted", undefined, cause);
      }
      lastError = cause;
      if (!retryable || attempt >= attempts - 1) {
        throw new ConnectionError(
          cause instanceof Error ? cause.message : "Network request failed",
          undefined,
          cause,
        );
      }
      await sleep(fullJitterDelay(attempt));
      continue;
    }

    try {
      context.rateLimit.update(response.headers);
      const limit = context.rateLimit.current.limit;
      if (context.bucket && limit !== null) {
        context.bucket.observeLimit(limit);
      }

      const requestId = response.headers.get("X-Request-ID") ?? undefined;

      if (!response.ok) {
        if (retryable && attempt < attempts - 1 && RETRYABLE_STATUSES.has(response.status)) {
          const retryAfter = context.rateLimit.current.retryAfter;
          await sleep(
            response.status === 429 && retryAfter !== null
              ? retryAfter * 1000 + Math.random() * 250
              : fullJitterDelay(attempt),
          );
          continue;
        }
        const { envelope, text } = await readEnvelope(response);
        throw createErrorFromStatus(
          response.status,
          errorMessage(envelope, text, response.status),
          requestId,
          context.rateLimit.current.retryAfter ?? undefined,
        );
      }

      const { envelope, text } = await readEnvelope<T>(response);
      if (!envelope) {
        throw new TropMailError(
          text.trim() || "Empty response body",
          response.status,
          requestId,
        );
      }
      if (!envelope.success) {
        throw createErrorFromStatus(
          response.status,
          errorMessage(envelope, text, response.status),
          requestId,
        );
      }
      if (envelope.data === null || envelope.data === undefined) {
        throw new TropMailError(
          envelope.message || "Response data is null",
          response.status,
          requestId,
        );
      }
      return envelope.data;
    } finally {
      dispose();
    }
  }

  throw new ConnectionError(
    lastError instanceof Error ? lastError.message : "Request failed after retries",
    undefined,
    lastError,
  );
}

/**
 * Authenticated GET that returns a raw Response body (attachment download).
 * Does not unwrap the JSON envelope.
 */
export async function requestBinary(context: ClientContext, spec: RequestSpec): Promise<Response> {
  const { config } = context;
  const url = buildUrl(config.baseUrl, spec);
  const attempts = config.maxRetries + 1;

  const headers: Record<string, string> = {
    Accept: "*/*",
    "User-Agent": USER_AGENT,
    "X-Request-ID": randomRequestId(),
  };
  if (spec.auth !== false) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (context.bucket) {
      await context.bucket.acquire();
    }

    const { signal, dispose } = withTimeout(spec.timeout ?? config.timeout, spec.signal);
    let response: Response;
    try {
      response = await config.fetch(url, {
        method: spec.method,
        headers,
        signal,
      });
    } catch (cause) {
      dispose();
      if (spec.signal?.aborted) {
        throw new ConnectionError("Request aborted", undefined, cause);
      }
      lastError = cause;
      if (attempt >= attempts - 1) {
        throw new ConnectionError(
          cause instanceof Error ? cause.message : "Network request failed",
          undefined,
          cause,
        );
      }
      await sleep(fullJitterDelay(attempt));
      continue;
    }

    try {
      context.rateLimit.update(response.headers);
      const limit = context.rateLimit.current.limit;
      if (context.bucket && limit !== null) {
        context.bucket.observeLimit(limit);
      }

      const requestId = response.headers.get("X-Request-ID") ?? undefined;

      if (!response.ok) {
        if (attempt < attempts - 1 && RETRYABLE_STATUSES.has(response.status)) {
          const retryAfter = context.rateLimit.current.retryAfter;
          await sleep(
            response.status === 429 && retryAfter !== null
              ? retryAfter * 1000 + Math.random() * 250
              : fullJitterDelay(attempt),
          );
          continue;
        }
        const { envelope, text } = await readEnvelope(response);
        throw createErrorFromStatus(
          response.status,
          errorMessage(envelope, text, response.status),
          requestId,
          context.rateLimit.current.retryAfter ?? undefined,
        );
      }

      return response;
    } finally {
      dispose();
    }
  }

  throw new ConnectionError(
    lastError instanceof Error ? lastError.message : "Request failed after retries",
    undefined,
    lastError,
  );
}
