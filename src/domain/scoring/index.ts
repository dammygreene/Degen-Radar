import { ageMs } from "../../utils/time";
import type { CategoryScore, ScanBundle, ScanResult } from "../scans/types";
import { calculateConfidence } from "./confidence";
import { scoreDemand } from "./demand";
import { scoreHolderGrowth } from "./holders";
import { scoreLiquidity } from "./liquidity";
import { scoreMomentum } from "./momentum";
import { scoreNarrative } from "./narrative";
import { scoreSecurity } from "./security";
import { scoreWalletIntel } from "./wallet-intel";

export * from "./confidence";
export { scoreSecurity } from "./security";
export { scoreDemand } from "./demand";
export { scoreLiquidity } from "./liquidity";
export { scoreHolderGrowth } from "./holders";
export { scoreWalletIntel } from "./wallet-intel";
export { scoreMomentum } from "./momentum";
export { scoreNarrative } from "./narrative";

export interface ScoreOptions {
  minLiquidityUsd: number;
  at?: Date;
}

/** Detect a scan-fatal security condition that should suppress alerts. */
export function hasCriticalRisk(bundle: ScanBundle): boolean {
  const sec = bundle.security;
  if (!sec) return false;
  return sec.riskFlags.some((f) => f.severity === "critical");
}

/**
 * Deterministic Radar score. Sums the seven explainable category scorers.
 * Every category returns evidence-grounded reasons — never a bare number.
 */
export function calculateRadarScore(bundle: ScanBundle, opts: ScoreOptions): ScanResult {
  const at = opts.at ?? new Date();

  const categories: CategoryScore[] = [
    scoreSecurity(bundle.security),
    scoreDemand(bundle.market, bundle.momentum),
    scoreLiquidity(bundle.market, opts.minLiquidityUsd),
    scoreHolderGrowth(bundle.holders, bundle.momentum),
    scoreWalletIntel(bundle.walletIntel),
    scoreMomentum(bundle.momentum),
    scoreNarrative(bundle.social),
  ];

  const score = Math.round(categories.reduce((sum, c) => sum + c.points, 0));
  const { confidence } = calculateConfidence(bundle, at);

  const positives = categories
    .filter((c) => c.direction === "positive")
    .sort((a, b) => b.points / b.maxPoints - a.points / a.maxPoints);
  const risks = categories
    .filter((c) => c.direction === "negative")
    .sort((a, b) => a.points / a.maxPoints - b.points / b.maxPoints);

  const dataAgeMs = Math.max(
    0,
    bundle.market ? ageMs(bundle.market.observedAt, at) : ageMs(bundle.scannedAt, at),
  );

  return {
    token: bundle.token,
    score,
    confidence,
    categories,
    positives,
    risks,
    criticalRisk: hasCriticalRisk(bundle),
    dataAgeMs,
    missingSources: bundle.missingSources,
    scannedAt: bundle.scannedAt,
  };
}
