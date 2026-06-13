import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("rejects requests after capacity is exhausted and refills over time", () => {
    const limiter = new RateLimiter(2, 1_000);

    expect(limiter.consume("client", 0)).toBe(true);
    expect(limiter.consume("client", 0)).toBe(true);
    expect(limiter.consume("client", 0)).toBe(false);
    expect(limiter.consume("client", 500)).toBe(true);
    expect(limiter.consume("client", 500)).toBe(false);
  });

  it("keeps clients isolated", () => {
    const limiter = new RateLimiter(1, 1_000);

    expect(limiter.consume("first", 0)).toBe(true);
    expect(limiter.consume("first", 0)).toBe(false);
    expect(limiter.consume("second", 0)).toBe(true);
  });
});
