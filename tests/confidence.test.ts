import { describe, expect, it } from "vitest";
import { calculateConfidence } from "../src/domain/scoring/confidence";
import type { ScanBundle } from "../src/domain/scans/types";
import type { TokenIdentity } from "../src/domain/types";

const token: TokenIdentity = { chain: "solana", address: "TOK", symbol: "ABC", name: null, decimals: 6 };
const now = new Date("2026-01-01T00:00:00Z");

function fullBundle(): ScanBundle {
  return {
    token,
    market: {
      token,
      priceUsd: 0.001,
      marketCapUsd: 30000,
      fdvUsd: 30000,
      liquidityUsd: 15000,
      volume: { m5: null, h1: 10000, h6: null, h24: null },
      txns: { buys15m: null, sells15m: null, buys1h: 100, sells1h: 50 },
      priceChange: { m5: null, h1: null, h6: null, h24: null },
      pairCount: 1,
      primaryPair: null,
      pairCreatedAt: null,
      boosts: 0,
      observedAt: now,
      source: "test",
    },
    security: {
      token,
      mintAuthority: null,
      freezeAuthority: null,
      tokenProgram: null,
      token2022Extensions: [],
      creatorAddress: null,
      creatorBalancePct: null,
      creatorRecentSellPct: null,
      top10Pct: 20,
      top20Pct: 30,
      suspiciousClusterScore: 0,
      bundledLaunch: false,
      liquidityChangePct: 0,
      riskFlags: [],
      observedAt: now,
      source: "test",
      status: "ok",
    },
    holders: {
      token,
      holderCount: 500,
      top10Pct: 20,
      top20Pct: 30,
      topHolderPct: 5,
      observedAt: now,
      source: "test",
      status: "ok",
    },
    momentum: {
      windowSeconds: 900,
      hasSufficientHistory: true,
      marketCapChangePct: 10,
      priceChangePct: 10,
      volumeChangePct: 20,
      buyerChangePct: 15,
      holderChangePct: 10,
      liquidityChangePct: 5,
    },
    walletIntel: {
      watchedWalletBuys: 1,
      fomoTraderBuys: 0,
      uniqueWallets: 1,
      clusterAdjustedCount: 1,
      independentEntities: 1,
      fomoHoldersCount: 0,
      avgFomoPnl30d: null,
      status: "ok",
    },
    social: {
      token,
      mentions15m: 5,
      mentions1h: 10,
      mentions6h: 20,
      mentions24h: 40,
      uniqueAuthors: 15,
      likes: 100,
      replies: 20,
      quotes: 5,
      repeatAuthorPct: 10,
      narrativeSummary: null,
      sourcePostIds: [],
      observedAt: now,
      source: "test",
      status: "ok",
    },
    missingSources: [],
    scannedAt: now,
  };
}

describe("confidence engine", () => {
  it("full data yields 100 confidence", () => {
    const res = calculateConfidence(fullBundle(), now);
    expect(res.confidence).toBe(100);
    expect(res.penalties).toHaveLength(0);
  });

  it("missing market data applies a large penalty", () => {
    const b = fullBundle();
    b.market = null;
    const res = calculateConfidence(b, now);
    expect(res.confidence).toBeLessThan(90);
    expect(res.penalties.some((p) => p.code === "MARKET_MISSING")).toBe(true);
  });

  it("stale market data is penalized", () => {
    const b = fullBundle();
    b.market!.observedAt = new Date(now.getTime() - 10 * 60_000);
    const res = calculateConfidence(b, now);
    expect(res.penalties.some((p) => p.code === "MARKET_STALE")).toBe(true);
  });

  it("multiple missing sources stack and clamp at 0..100", () => {
    const b = fullBundle();
    b.market = null;
    b.security = null;
    b.holders = null;
    b.social = null;
    b.momentum = null;
    const res = calculateConfidence(b, now);
    expect(res.confidence).toBeGreaterThanOrEqual(0);
    expect(res.confidence).toBeLessThan(70);
  });

  it("unavailable X reduces confidence but only modestly", () => {
    const b = fullBundle();
    b.social = null;
    const res = calculateConfidence(b, now);
    expect(res.confidence).toBe(95);
  });
});
