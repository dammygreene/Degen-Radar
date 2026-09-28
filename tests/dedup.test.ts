import { describe, expect, it } from "vitest";
import { computeTradeIdempotencyKey, TtlDedupCache } from "../src/domain/dedup";

describe("trade idempotency keys", () => {
  const base = {
    wallet: "WALLET_A",
    tokenAddress: "TOKEN_X",
    side: "BUY" as const,
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    source: "solana",
  };

  it("prefers signature", () => {
    const k = computeTradeIdempotencyKey({ ...base, signature: "SIG1" });
    expect(k).toBe("sig:SIG1:WALLET_A");
  });

  it("falls back to provider event id", () => {
    const k = computeTradeIdempotencyKey({ ...base, providerEventId: "EVT1" });
    expect(k).toBe("evt:solana:EVT1");
  });

  it("hashes deterministically within the same time bucket", () => {
    const a = computeTradeIdempotencyKey({ ...base, amountUsd: 100 });
    const b = computeTradeIdempotencyKey({
      ...base,
      amountUsd: 100,
      occurredAt: new Date("2026-01-01T00:00:30Z"), // same 60s bucket
    });
    expect(a).toBe(b);
  });

  it("differs across time buckets", () => {
    const a = computeTradeIdempotencyKey({ ...base, amountUsd: 100 });
    const b = computeTradeIdempotencyKey({
      ...base,
      amountUsd: 100,
      occurredAt: new Date("2026-01-01T00:05:00Z"),
    });
    expect(a).not.toBe(b);
  });
});

describe("TtlDedupCache", () => {
  it("returns true for new keys, false for duplicates", () => {
    const cache = new TtlDedupCache(1000);
    expect(cache.add("k1", 0)).toBe(true);
    expect(cache.add("k1", 100)).toBe(false);
    expect(cache.has("k1", 200)).toBe(true);
  });

  it("expires keys after ttl", () => {
    const cache = new TtlDedupCache(1000);
    cache.add("k1", 0);
    expect(cache.has("k1", 2000)).toBe(false);
    expect(cache.add("k1", 2000)).toBe(true); // re-addable after expiry
  });
});
