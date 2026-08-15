/** Snapshot of rate-limit headers from the most recent authenticated response. */
export interface RateLimitSnapshot {
  limit: number | null;
  remaining: number | null;
  reset: number | null;
  retryAfter: number | null;
}

export const EMPTY_RATE_LIMIT: RateLimitSnapshot = {
  limit: null,
  remaining: null,
  reset: null,
  retryAfter: null,
};

function parseHeaderInt(value: string | null): number | null {
  if (value === null || value === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parse rate-limit response headers into a snapshot. */
export function parseRateLimitHeaders(headers: Headers): RateLimitSnapshot {
  return {
    limit: parseHeaderInt(headers.get("X-RateLimit-Limit")),
    remaining: parseHeaderInt(headers.get("X-RateLimit-Remaining")),
    reset: parseHeaderInt(headers.get("X-RateLimit-Reset")),
    retryAfter: parseHeaderInt(headers.get("Retry-After")),
  };
}

/** Mutable holder for the latest rate-limit snapshot on a client instance. */
export class RateLimitTracker {
  private snapshot: RateLimitSnapshot = { ...EMPTY_RATE_LIMIT };

  get current(): RateLimitSnapshot {
    return { ...this.snapshot };
  }

  update(headers: Headers): void {
    this.snapshot = parseRateLimitHeaders(headers);
  }

  reset(): void {
    this.snapshot = { ...EMPTY_RATE_LIMIT };
  }
}
