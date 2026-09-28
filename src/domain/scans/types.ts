import type {
  HolderData,
  SocialSnapshot,
  TokenIdentity,
  TokenMarketData,
  TokenSecurityData,
} from "../types";

export type ScanReason =
  | "WATCHED_WALLET_BUY"
  | "FOMO_BUY"
  | "CONVERGENCE"
  | "MANUAL"
  | "DISCOVERY"
  | "MOMENTUM";

export type SignalDirection = "positive" | "negative" | "neutral";

export type ScoreCategory =
  | "SECURITY"
  | "DEMAND"
  | "LIQUIDITY"
  | "HOLDER_GROWTH"
  | "WALLET_INTEL"
  | "MOMENTUM"
  | "NARRATIVE";

export interface CategoryScore {
  category: ScoreCategory;
  points: number;
  maxPoints: number;
  direction: SignalDirection;
  /** Human-readable, evidence-grounded reason. Never a bare number. */
  reason: string;
  evidence?: Record<string, unknown>;
}

export const CATEGORY_MAX: Record<ScoreCategory, number> = {
  SECURITY: 25,
  DEMAND: 20,
  LIQUIDITY: 15,
  HOLDER_GROWTH: 15,
  WALLET_INTEL: 10,
  MOMENTUM: 10,
  NARRATIVE: 5,
};

/** Momentum comparison of two snapshots. */
export interface MomentumMetrics {
  windowSeconds: number;
  hasSufficientHistory: boolean;
  marketCapChangePct: number | null;
  priceChangePct: number | null;
  volumeChangePct: number | null;
  buyerChangePct: number | null;
  holderChangePct: number | null;
  liquidityChangePct: number | null;
}

/** Wallet intelligence aggregated for a token at scan time. */
export interface WalletIntel {
  watchedWalletBuys: number;
  fomoTraderBuys: number;
  uniqueWallets: number;
  clusterAdjustedCount: number;
  independentEntities: number;
  fomoHoldersCount: number | null;
  avgFomoPnl30d: number | null;
  status: "ok" | "partial" | "unavailable";
}

/** Everything the scan orchestrator gathered for a token. */
export interface ScanBundle {
  token: TokenIdentity;
  market: TokenMarketData | null;
  security: TokenSecurityData | null;
  holders: HolderData | null;
  momentum: MomentumMetrics | null;
  walletIntel: WalletIntel | null;
  social: SocialSnapshot | null;
  /** Providers that failed / were unavailable for this scan. */
  missingSources: string[];
  scannedAt: Date;
}

export interface ScanResult {
  token: TokenIdentity;
  score: number;
  confidence: number;
  categories: CategoryScore[];
  positives: CategoryScore[];
  risks: CategoryScore[];
  criticalRisk: boolean;
  dataAgeMs: number;
  missingSources: string[];
  scannedAt: Date;
}
