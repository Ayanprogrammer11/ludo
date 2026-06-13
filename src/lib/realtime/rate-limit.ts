type Bucket = {
  tokens: number;
  updatedAt: number;
};

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private capacity: number,
    private refillWindowMs: number,
    private maxBuckets = 10_000,
  ) {}

  consume(key: string, now = Date.now(), cost = 1): boolean {
    if (!key || cost <= 0 || cost > this.capacity) return false;
    if (!this.buckets.has(key) && this.buckets.size >= this.maxBuckets) this.prune(now);

    const previous = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsed = Math.max(0, now - previous.updatedAt);
    const tokens = Math.min(
      this.capacity,
      previous.tokens + (elapsed * this.capacity) / this.refillWindowMs,
    );
    const allowed = tokens >= cost;

    this.buckets.delete(key);
    this.buckets.set(key, {
      tokens: allowed ? tokens - cost : tokens,
      updatedAt: now,
    });
    return allowed;
  }

  private prune(now: number) {
    const staleAfterMs = this.refillWindowMs * 2;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt >= staleAfterMs) this.buckets.delete(key);
    }
    while (this.buckets.size >= this.maxBuckets) {
      const oldest = this.buckets.keys().next().value;
      if (!oldest) break;
      this.buckets.delete(oldest);
    }
  }
}
