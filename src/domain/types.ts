/**
 * Normalized domain types. Provider adapters map external responses into these.
 * Domain / scoring / service code must only depend on this module.
 */

export type Chain = "solana";

export type DataStatus = "ok" | "partial" | "stale" | "unavailable";

/** Wraps a value with provenance + freshness so scoring can reason about it. */
export interface Observed<T> {
  value: T;
  status: DataStatus;
  source: string;
  observedAt: Date;
}

export interface TokenIdentity {
  chain: Chain;
  address: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
}

export interface TokenMarketData {
  token: TokenIdentity;
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume: {
    m5: number | null;
    h1: number | null;
    h6: number | null;
    h24: number | null;
  };
  txns: {
    buys15m: number | null;
    sells15m: number | null;
    buys1h: number | null;
    sells1h: number | null;
  };
  priceChange: {
    m5: number | null;
    h1: number | null;
    h6: number | null;
    h24: number | null;
  };
  pairCount: number | null;
  primaryPair: PairMarketData | null;
  pairCreatedAt: Date | null;
  boosts: number | null;
  observedAt: Date;
  source: string;
}

export interface PairMarketData {
  pairAddress: string;
  dex: string;
  quoteAddress: string;
  quoteSymbol: string | null;
  liquidityUsd: number | null;
  priceUsd: number | null;
  createdAt: Date | null;
}

export interface RiskFlag {
  code: string;
  severity: "info" | "warn" | "critical";
  message: string;
}

export interface TokenSecurityData {
  token: TokenIdentity;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  tokenProgram: string | null;
  token2022Extensions: string[];
  creatorAddress: string | null;
  creatorBalancePct: number | null;
  creatorRecentSellPct: number | null;
  top10Pct: number | null;
  top20Pct: number | null;
  suspiciousClusterScore: number | null; // 0..1, higher = worse
  bundledLaunch: boolean | null;
  liquidityChangePct: number | null; // negative = liquidity leaving
  riskFlags: RiskFlag[];
  observedAt: Date;
  source: string;
  status: DataStatus;
}

export interface HolderData {
  token: TokenIdentity;
  holderCount: number | null;
  top10Pct: number | null;
  top20Pct: number | null;
  topHolderPct: number | null;
  observedAt: Date;
  source: string;
  status: DataStatus;
}

export type TradeSide = "BUY" | "SELL";

export interface NormalizedTrade {
  wallet: string;
  tokenAddress: string;
  side: TradeSide;
  amountToken: number | null;
  amountUsd: number | null;
  occurredAt: Date;
  signature: string | null;
  providerEventId: string | null;
  source: string;
  /** Deterministic dedup key computed by the normalizer. */
  idempotencyKey: string;
}

export interface WalletProfile {
  address: string;
  chain: Chain;
  label: string | null;
  pnl24h: number | null;
  pnl7d: number | null;
  pnl30d: number | null;
  pnlAll: number | null;
  observedAt: Date;
  source: string;
}

export interface FomoTrader {
  handle: string;
  wallet: string | null;
  profileId: string | null;
  pnl30d: number | null;
  winRate: number | null;
  accountAgeDays: number | null;
  observedAt: Date;
  source: string;
}

export interface FomoHolder {
  handle: string | null;
  wallet: string;
  amount: number | null;
  valueUsd: number | null;
}

export interface FomoPosition {
  handle: string;
  tokenAddress: string;
  amount: number | null;
  valueUsd: number | null;
  observedAt: Date;
}

export interface XPost {
  id: string;
  authorId: string;
  authorHandle: string | null;
  text: string;
  createdAt: Date;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
}

export interface SocialSnapshot {
  token: TokenIdentity;
  mentions15m: number;
  mentions1h: number;
  mentions6h: number;
  mentions24h: number;
  uniqueAuthors: number;
  likes: number;
  replies: number;
  quotes: number;
  repeatAuthorPct: number;
  narrativeSummary: string | null;
  sourcePostIds: string[];
  observedAt: Date;
  source: string;
  status: DataStatus;
}

/** A watched entity resolved to (possibly) an underlying wallet. */
export interface ResolvedEntity {
  entityId: string;
  entityType: "wallet" | "fomo";
  label: string | null;
  wallet: string | null;
  fomoHandle: string | null;
  clusterId: string | null;
}
