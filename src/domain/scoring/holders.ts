import type { HolderData } from "../types";
import { CATEGORY_MAX, type CategoryScore, type MomentumMetrics } from "../scans/types";
import { clamp, isNum, lerp, round1 } from "./util";

const MAX = CATEGORY_MAX.HOLDER_GROWTH;

/**
 * Holder Growth (15 pts). Rewards a growing holder base and declining
 * concentration. Insufficient history is marked, never guessed.
 */
export function scoreHolderGrowth(
  holders: HolderData | null,
  momentum: MomentumMetrics | null,
): CategoryScore {
  if (!holders || holders.status === "unavailable" || !isNum(holders.holderCount)) {
    return {
      category: "HOLDER_GROWTH",
      points: round1(MAX * 0.33),
      maxPoints: MAX,
      direction: "neutral",
      reason: "Holder data unavailable; scored conservatively.",
      evidence: { status: holders?.status ?? "unavailable" },
    };
  }

  const reasons: string[] = [];

  // Base holder count (up to 6)
  const basePts = lerp(holders.holderCount, 50, 1500, 1, 6);
  reasons.push(`${holders.holderCount.toLocaleString()} holders`);

  // Growth velocity (up to 6)
  let growthPts = MAX * 0.2;
  if (momentum?.hasSufficientHistory && isNum(momentum.holderChangePct)) {
    growthPts = lerp(momentum.holderChangePct, 0, 40, 0, 6);
    if (momentum.holderChangePct > 0) {
      reasons.push(`holders +${Math.round(momentum.holderChangePct)}% in window`);
    } else {
      reasons.push("holder base flat/declining");
    }
  } else {
    reasons.push("holder growth history insufficient");
  }

  // Concentration (up to 3): lower top10 is better
  let concPts = 1.5;
  if (isNum(holders.top10Pct)) {
    concPts = lerp(holders.top10Pct, 60, 20, 0, 3);
    reasons.push(`top-10 ${Math.round(holders.top10Pct)}%`);
  }

  const points = clamp(round1(basePts + growthPts + concPts), 0, MAX);
  const direction = points >= MAX * 0.55 ? "positive" : points <= MAX * 0.35 ? "negative" : "neutral";

  return {
    category: "HOLDER_GROWTH",
    points,
    maxPoints: MAX,
    direction,
    reason: `Holders: ${reasons.slice(0, 3).join("; ")}.`,
    evidence: {
      holderCount: holders.holderCount,
      top10Pct: holders.top10Pct,
      holderChangePct: momentum?.holderChangePct ?? null,
    },
  };
}
