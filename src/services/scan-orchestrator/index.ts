import { getConfig } from "../../config";
import { analyzeConvergence, type ConvergenceEntry } from "../../domain/convergence";
import { computeMomentum, type MomentumSnapshot } from "../../domain/momentum";
import { calculateRadarScore } from "../../domain/scoring";
import type {
  MomentumMetrics,
  ScanBundle,
  ScanReason,
  ScanResult,
  WalletIntel,
} from "../../domain/scans/types";
import type {
  HolderData,
  SocialSnapshot,
  TokenIdentity,
  TokenMarketData,
  TokenSecurityData,
} from "../../domain/types";
import { assertSolanaAddress } from "../../utils/solana-address";
import { logger } from "../../utils/logger";
import { getProviders } from "../../providers/registry";
import type { ProviderBundle } from "../../providers/types";
import { aggregateSocial } from "../x-intelligence/aggregate";

export type { ScanReason } from "../../domain/scans/types";

export interface ScanContext {
  reason: ScanReason;
  /** Recent watched-entity entries used for wallet intel + convergence. */
  convergenceEntries?: ConvergenceEntry[];
  /** Prior market snapshots for momentum (most recent last). */
  history?: MomentumSnapshot[];
  now?: Date;
}

export interface FullScan {
  bundle: ScanBundle;
  result: ScanResult;
  market: TokenMarketData | null;
}

/**
 * Runs a complete token scan: parallel provider fetches, graceful degradation,
 * momentum + wallet-intel aggregation, then deterministic scoring. A single
 * provider failure never fails the scan — it lowers confidence and is recorded
 * in `missingSources`.
 */
export async function scanToken(
  tokenAddress: string,
  context: ScanContext,
  providers: ProviderBundle = getProviders(),
): Promise<FullScan> {
  const address = assertSolanaAddress(tokenAddress);
  const cfg = getConfig();
  const now = context.now ?? new Date();
  const missing: string[] = [];
  const timings: Record<string, number> = {};

  const timed = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    const start = Date.now();
    try {
      const value = await fn();
      timings[name] = Date.now() - start;
      return value;
    } catch (err) {
      timings[name] = Date.now() - start;
      missing.push(name);
      logger.warn({ err, name, address }, "scan provider failed (degrading)");
      return null;
    }
  };

  // Parallel intelligence fetches.
  const [market, security, holders, socialPosts] = await Promise.all([
    timed<TokenMarketData | null>("market", () => providers.market.getToken(address)),
    timed<TokenSecurityData>("security", () => providers.chain.getTokenSecurity(address)),
    timed<HolderData>("holders", () => providers.chain.getHolders(address)),
    providers.x
      ? timed("x", () => providers.x!.searchPosts(address, { maxResults: 40, sinceMinutes: 1440 }))
      : Promise.resolve(null),
  ]);

  if (!market) missing.push("market-token");

  const token: TokenIdentity = market?.token ?? {
    chain: "solana",
    address,
    symbol: null,
    name: null,
    decimals: security?.token?.decimals ?? null,
  };

  // Merge live market concentration into security when chain adapter lacks it.
  const mergedSecurity = mergeSecurity(security, holders);

  // Momentum from prior snapshots + current market.
  const momentum = buildMomentum(market, context.history, now);

  // Social snapshot (grounded aggregation).
  const social: SocialSnapshot | null = providers.x
    ? aggregateSocial(token, socialPosts ?? [], { available: socialPosts !== null, now })
    : null;
  if (!providers.x) missing.push("x-disabled");

  // Wallet intelligence + convergence from provided entries.
  const walletIntel = await buildWalletIntel(address, context, providers, now);

  const bundle: ScanBundle = {
    token,
    market,
    security: mergedSecurity,
    holders,
    momentum,
    walletIntel,
    social,
    missingSources: [...new Set(missing)],
    scannedAt: now,
  };

  const result = calculateRadarScore(bundle, {
    minLiquidityUsd: cfg.universe.minLiquidityUsd,
    at: now,
  });

  logger.info(
    {
      address,
      reason: context.reason,
      score: result.score,
      confidence: result.confidence,
      criticalRisk: result.criticalRisk,
      missing: bundle.missingSources,
      timings,
    },
    "scan completed",
  );

  return { bundle, result, market };
}

function mergeSecurity(
  security: TokenSecurityData | null,
  holders: HolderData | null,
): TokenSecurityData | null {
  if (!security) return null;
  if (security.top10Pct == null && holders?.top10Pct != null) {
    return { ...security, top10Pct: holders.top10Pct, top20Pct: holders.top20Pct };
  }
  return security;
}

function buildMomentum(
  market: TokenMarketData | null,
  history: MomentumSnapshot[] | undefined,
  now: Date,
): MomentumMetrics | null {
  if (!market) return history && history.length >= 2 ? computeMomentum(history) : null;
  const current: MomentumSnapshot = {
    capturedAt: now,
    marketCapUsd: market.marketCapUsd,
    priceUsd: market.priceUsd,
    liquidityUsd: market.liquidityUsd,
    volume1h: market.volume.h1,
    uniqueBuyers: market.txns.buys1h,
    holders: null,
  };
  const snaps = [...(history ?? []), current];
  if (snaps.length < 2) return null;
  return computeMomentum(snaps);
}

async function buildWalletIntel(
  tokenAddress: string,
  context: ScanContext,
  providers: ProviderBundle,
  now: Date,
): Promise<WalletIntel | null> {
  const entries = context.convergenceEntries ?? [];
  let fomoHoldersCount: number | null = null;
  const avgFomoPnl30d: number | null = null;

  if (providers.fomo) {
    try {
      const fh = await providers.fomo.getTokenHolders(tokenAddress);
      fomoHoldersCount = fh.length;
    } catch (err) {
      logger.warn({ err }, "fomo getTokenHolders failed");
    }
  }

  if (entries.length === 0 && fomoHoldersCount === null) return null;

  const conv = analyzeConvergence(entries, {
    windowSeconds: getConfig().alerts.convergenceWindowSeconds,
    minEntities: getConfig().alerts.convergenceMinEntities,
    now,
  });

  const fomoBuys = entries.filter((e) => e.entityType === "fomo").length;

  return {
    watchedWalletBuys: entries.filter((e) => e.entityType === "wallet").length,
    fomoTraderBuys: fomoBuys,
    uniqueWallets: conv.uniqueWalletCount,
    clusterAdjustedCount: conv.clusterAdjustedCount,
    independentEntities: conv.clusterAdjustedCount,
    fomoHoldersCount,
    avgFomoPnl30d,
    status: entries.length > 0 ? "ok" : "partial",
  };
}
