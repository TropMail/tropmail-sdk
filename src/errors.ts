export class TropMailError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.name = "TropMailError";
    this.status = status;
    this.requestId = requestId;
  }
}

export class AuthenticationError extends TropMailError {
  constructor(message: string, status: number, requestId?: string) {
    super(message, status, requestId);
    this.name = "AuthenticationError";
  }
}

export class TierError extends TropMailError {
  constructor(message: string, status: number, requestId?: string) {
    super(message, status, requestId);
    this.name = "TierError";
  }
}

export class NotFoundError extends TropMailError {
  constructor(message: string, status: number, requestId?: string) {
    super(message, status, requestId);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends TropMailError {
  constructor(message: string, status: number, requestId?: string) {
    super(message, status, requestId);
    this.name = "ValidationError";
  }
}

export class RateLimitError extends TropMailError {
  readonly retryAfter?: number;

  constructor(
    message: string,
    status: number,
    requestId?: string,
    retryAfter?: number,
  ) {
    super(message, status, requestId);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class MarkdownTimeoutError extends TropMailError {
  constructor(message: string, status: number, requestId?: string) {
    super(message, status, requestId);
    this.name = "MarkdownTimeoutError";
  }
}

export class ServerError extends TropMailError {
  constructor(message: string, status: number, requestId?: string) {
    super(message, status, requestId);
    this.name = "ServerError";
  }
}

export class ConnectionError extends TropMailError {
  constructor(message: string, requestId?: string, cause?: unknown) {
    super(message, 0, requestId);
    this.name = "ConnectionError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/** Map HTTP status codes to SDK error classes. */
export function createErrorFromStatus(
  status: number,
  message: string,
  requestId?: string,
  retryAfter?: number,
): TropMailError {
  switch (status) {
    case 400:
      return new ValidationError(message, status, requestId);
    case 401:
      return new AuthenticationError(message, status, requestId);
    case 403:
      return new TierError(message, status, requestId);
    case 404:
      return new NotFoundError(message, status, requestId);
    case 429:
      return new RateLimitError(message, status, requestId, retryAfter);
    case 504:
      return new MarkdownTimeoutError(message, status, requestId);
    default:
      if (status >= 500) {
        return new ServerError(message, status, requestId);
      }
      return new TropMailError(message, status, requestId);
  }
}
