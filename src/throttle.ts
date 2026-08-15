/**
 * Client-side token bucket that paces requests to the server's advertised budget.
 *
 * Stays inert until the first `X-RateLimit-Limit` header is seen, so the very
 * first request is never delayed. Once the tier budget is known, callers are
 * spaced just enough to stay inside the server's 1-second sliding window.
 */
export class TokenBucket {
  private rateValue: number | null = null;
  private tokens = 0;
  private updatedAt = Date.now();
  /** Serializes reservations so concurrent callers cannot overspend. */
  private queue: Promise<void> = Promise.resolve();

  get rate(): number | null {
    return this.rateValue;
  }

  /** Size the bucket from a server-advertised per-second limit. */
  observeLimit(limit: number): void {
    if (!Number.isFinite(limit) || limit <= 0 || this.rateValue === limit) {
      return;
    }
    this.rateValue = limit;
    this.tokens = limit;
    this.updatedAt = Date.now();
  }

  /** Consume a token, returning how long the caller must wait first. */
  reserve(): number {
    const rate = this.rateValue;
    if (rate === null) {
      return 0;
    }
    const now = Date.now();
    this.tokens = Math.min(rate, this.tokens + ((now - this.updatedAt) / 1000) * rate);
    this.updatedAt = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    const deficit = 1 - this.tokens;
    this.tokens = 0;
    return (deficit / rate) * 1000;
  }

  async acquire(): Promise<void> {
    const wait = this.queue.then(async () => {
      const delay = this.reserve();
      if (delay > 0) {
        await sleep(delay);
      }
    });
    this.queue = wait.catch(() => undefined);
    return wait;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
