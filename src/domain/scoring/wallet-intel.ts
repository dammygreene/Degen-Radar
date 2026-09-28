import { CATEGORY_MAX, type CategoryScore, type WalletIntel } from "../scans/types";
import { clamp, isNum, lerp, round1 } from "./util";

const MAX = CATEGORY_MAX.WALLET_INTEL;

/**
 * Wallet Intelligence (10 pts). Rewards independent watched/FOMO entries.
 * Critically: the same wallet is never rewarded twice — inputs are already
 * de-duplicated and cluster-adjusted upstream (convergence engine).
 */
export function scoreWalletIntel(intel: WalletIntel | null): CategoryScore {
  if (!intel || intel.status === "unavailable") {
    return {
      category: "WALLET_INTEL",
      points: 0,
      maxPoints: MAX,
      direction: "neutral",
      reason: "No watched-wallet / FOMO intelligence available for this token.",
    };
  }

  const reasons: string[] = [];

  // Independent entities drive most of the score (up to 7)
  const independentPts = lerp(intel.clusterAdjustedCount, 1, 4, 2, 7);
  if (intel.independentEntities > 0) {
    reasons.push(
      `${intel.independentEntities} watched entit${intel.independentEntities === 1 ? "y" : "ies"} entered ` +
        `(${intel.clusterAdjustedCount} cluster-adjusted, ${intel.uniqueWallets} unique wallets)`,
    );
  }

  // FOMO trader quality context (up to 3)
  let qualityPts = 0;
  if (isNum(intel.avgFomoPnl30d) && intel.fomoTraderBuys > 0) {
    qualityPts = lerp(intel.avgFomoPnl30d, 0, 200, 0, 3);
    reasons.push(`avg FOMO 30d PnL ${Math.round(intel.avgFomoPnl30d)}%`);
  }

  const points = clamp(
    round1(intel.independentEntities > 0 ? independentPts + qualityPts : 0),
    0,
    MAX,
  );
  const direction = points > 0 ? "positive" : "neutral";

  return {
    category: "WALLET_INTEL",
    points,
    maxPoints: MAX,
    direction,
    reason: reasons.length
      ? `Wallet intel: ${reasons.join("; ")}.`
      : "No independent watched-wallet activity detected.",
    evidence: {
      watchedWalletBuys: intel.watchedWalletBuys,
      fomoTraderBuys: intel.fomoTraderBuys,
      uniqueWallets: intel.uniqueWallets,
      clusterAdjustedCount: intel.clusterAdjustedCount,
      independentEntities: intel.independentEntities,
    },
  };
}
