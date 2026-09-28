import { describe, expect, it } from "vitest";
import { calculateRadarScore } from "../src/domain/scoring";
import { scoreSecurity } from "../src/domain/scoring/security";
import { scoreLiquidity } from "../src/domain/scoring/liquidity";
import { scoreWalletIntel } from "../src/domain/scoring/wallet-intel";
import { CATEGORY_MAX, type ScanBundle } from "../src/domain/scans/types";
import type {
  HolderData,
  SocialSnapshot,
  TokenIdentity,
  TokenMarketData,
  TokenSecurityData,
} from "../src/domain/types";

const token: TokenIdentity = { chain: "solana", address: "TOK", symbol: "ABC", name: "ABC", decimals: 6 };
const now = new Date("2026-01-01T00:00:00Z");

function market(over: Partial<TokenMarketData> = {}): TokenMarketData {
  return {
    token,
    priceUsd: 0.001,
    marketCapUsd: 34_000,
    fdvUsd: 40_000,
    liquidityUsd: 16_000,
    volume: { m5: 2000, h1: 40_000, h6: 120_000, h24: 300_000 },
    txns: { buys15m: 40, sells15m: 20, buys1h: 180, sells1h: 90 },
    priceChange: { m5: 5, h1: 40, h6: 80, h24: 120 },
    pairCount: 2,
    primaryPair: null,
    pairCreatedAt: new Date(now.getTime() - 42 * 60_000),
    boosts: 0,
    observedAt: now,
    source: "test",
    ...over,
  };
}

function security(over: Partial<TokenSecurityData> = {}): TokenSecurityData {
  return {
    token,
    mintAuthority: null,
    freezeAuthority: null,
    tokenProgram: "Tokenkeg",
    token2022Extensions: [],
    creatorAddress: "CREATOR",
    creatorBalancePct: 3,
    creatorRecentSellPct: 0,
    top10Pct: 24,
    top20Pct: 35,
    suspiciousClusterScore: 0.1,
    bundledLaunch: false,
    liquidityChangePct: 5,
    riskFlags: [],
    observedAt: now,
    source: "test",
    status: "ok",
    ...over,
  };
}

function holders(over: Partial<HolderData> = {}): HolderData {
  return {
    token,
    holderCount: 900,
    top10Pct: 24,
    top20Pct: 35,
    topHolderPct: 8,
    observedAt: now,
    source: "test",
    status: "ok",
    ...over,
  };
}

function social(over: Partial<SocialSnapshot> = {}): SocialSnapshot {
  return {
    token,
    mentions15m: 12,
    mentions1h: 24,
    mentions6h: 60,
    mentions24h: 120,
    uniqueAuthors: 35,
    likes: 400,
    replies: 90,
    quotes: 40,
    repeatAuthorPct: 15,
    narrativeSummary: "grounded",
    sourcePostIds: ["a", "b"],
    observedAt: now,
    source: "test",
    status: "ok",
    ...over,
  };
}

function healthyBundle(): ScanBundle {
  return {
    token,
    market: market(),
    security: security(),
    holders: holders(),
    momentum: {
      windowSeconds: 900,
      hasSufficientHistory: true,
      marketCapChangePct: 30,
      priceChangePct: 40,
      volumeChangePct: 187,
      buyerChangePct: 74,
      holderChangePct: 37,
      liquidityChangePct: 10,
    },
    walletIntel: {
      watchedWalletBuys: 2,
      fomoTraderBuys: 1,
      uniqueWallets: 3,
      clusterAdjustedCount: 3,
      independentEntities: 3,
      fomoHoldersCount: 4,
      avgFomoPnl30d: 120,
      status: "ok",
    },
    social: social(),
    missingSources: [],
    scannedAt: now,
  };
}

describe("category scorers", () => {
  it("security: clean token scores high, always has a reason", () => {
    const s = scoreSecurity(security());
    expect(s.points).toBeGreaterThan(CATEGORY_MAX.SECURITY * 0.7);
    expect(s.reason).toBeTruthy();
    expect(s.maxPoints).toBe(25);
  });

  it("security: active authorities and concentration reduce score", () => {
    const s = scoreSecurity(
      security({ mintAuthority: "M", freezeAuthority: "F", top10Pct: 65, creatorRecentSellPct: 5 }),
    );
    expect(s.points).toBeLessThan(CATEGORY_MAX.SECURITY * 0.6);
    expect(s.direction).not.toBe("positive");
  });

  it("liquidity: thin liquidity scores below floor", () => {
    const thin = scoreLiquidity(market({ liquidityUsd: 1000, marketCapUsd: 50000 }), 8000);
    const healthy = scoreLiquidity(market({ liquidityUsd: 30000, marketCapUsd: 60000 }), 8000);
    expect(healthy.points).toBeGreaterThan(thin.points);
  });

  it("wallet intel: never rewards zero independent entities", () => {
    const s = scoreWalletIntel({
      watchedWalletBuys: 0,
      fomoTraderBuys: 0,
      uniqueWallets: 0,
      clusterAdjustedCount: 0,
      independentEntities: 0,
      fomoHoldersCount: 0,
      avgFomoPnl30d: null,
      status: "ok",
    });
    expect(s.points).toBe(0);
  });
});

describe("calculateRadarScore", () => {
  it("healthy token yields a high score and high confidence", () => {
    const res = calculateRadarScore(healthyBundle(), { minLiquidityUsd: 8000, at: now });
    expect(res.score).toBeGreaterThanOrEqual(75);
    expect(res.score).toBeLessThanOrEqual(100);
    expect(res.confidence).toBeGreaterThanOrEqual(90);
    expect(res.criticalRisk).toBe(false);
    expect(res.positives.length).toBeGreaterThan(0);
    // total of categories equals score
    const sum = Math.round(res.categories.reduce((a, c) => a + c.points, 0));
    expect(sum).toBe(res.score);
  });

  it("never exceeds 100 or drops below 0", () => {
    const res = calculateRadarScore(healthyBundle(), { minLiquidityUsd: 8000, at: now });
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it("critical risk flag is surfaced", () => {
    const bundle = healthyBundle();
    bundle.security = security({
      riskFlags: [{ code: "RUG", severity: "critical", message: "honeypot detected" }],
    });
    const res = calculateRadarScore(bundle, { minLiquidityUsd: 8000, at: now });
    expect(res.criticalRisk).toBe(true);
  });

  it("every category exposes an explainable reason (never a bare number)", () => {
    const res = calculateRadarScore(healthyBundle(), { minLiquidityUsd: 8000, at: now });
    for (const c of res.categories) {
      expect(typeof c.reason).toBe("string");
      expect(c.reason.length).toBeGreaterThan(3);
    }
  });
});
