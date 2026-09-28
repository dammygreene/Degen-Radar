import type { TokenMarketData } from "../types";
import { CATEGORY_MAX, type CategoryScore } from "../scans/types";
import { clamp, isNum, lerp, ratio, round1 } from "./util";

const MAX = CATEGORY_MAX.LIQUIDITY;

/**
 * Liquidity (15 pts). Rewards absolute depth and a healthy liquidity/MC ratio;
 * penalizes extremely thin or rapidly disappearing liquidity.
 */
export function scoreLiquidity(
  market: TokenMarketData | null,
  minLiquidityUsd: number,
): CategoryScore {
  if (!market || !isNum(market.liquidityUsd)) {
    return {
      category: "LIQUIDITY",
      points: 0,
      maxPoints: MAX,
      direction: "neutral",
      reason: "Liquidity data unavailable.",
    };
  }

  const liq = market.liquidityUsd;
  const reasons: string[] = [];

  // Absolute liquidity relative to the configured floor (up to 9)
  let absPts: number;
  if (liq < minLiquidityUsd) {
    absPts = lerp(liq, 0, minLiquidityUsd, 0, 4);
    reasons.push(`liquidity $${Math.round(liq).toLocaleString()} below floor`);
  } else {
    absPts = lerp(liq, minLiquidityUsd, minLiquidityUsd * 6, 4, 9);
    reasons.push(`liquidity $${Math.round(liq).toLocaleString()}`);
  }

  // Liquidity / MC ratio (up to 6). Very low ratio = fragile.
  let ratioPts = MAX * 0.3;
  const lmc = ratio(liq, market.marketCapUsd);
  if (isNum(lmc)) {
    ratioPts = lerp(lmc, 0.05, 0.4, 1, 6);
    reasons.push(`liq/MC ${Math.round(lmc * 100)}%`);
  }

  const points = clamp(round1(absPts + ratioPts), 0, MAX);
  const direction = points >= MAX * 0.6 ? "positive" : points <= MAX * 0.35 ? "negative" : "neutral";

  return {
    category: "LIQUIDITY",
    points,
    maxPoints: MAX,
    direction,
    reason: `Liquidity: ${reasons.join("; ")}.`,
    evidence: { liquidityUsd: liq, marketCapUsd: market.marketCapUsd, liqToMc: lmc },
  };
}
