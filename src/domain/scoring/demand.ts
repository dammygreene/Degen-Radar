import type { TokenMarketData } from "../types";
import { CATEGORY_MAX, type CategoryScore, type MomentumMetrics } from "../scans/types";
import { clamp, isNum, lerp, ratio, round1 } from "./util";

const MAX = CATEGORY_MAX.DEMAND;

/**
 * Demand (20 pts). Rewards sustained buy pressure, healthy buy/sell balance and
 * volume relative to liquidity — not a single green candle.
 */
export function scoreDemand(
  market: TokenMarketData | null,
  momentum: MomentumMetrics | null,
): CategoryScore {
  if (!market) {
    return unavailable();
  }

  const buys = market.txns.buys1h ?? market.txns.buys15m;
  const sells = market.txns.sells1h ?? market.txns.sells15m;
  const volumeH1 = market.volume.h1;
  const liquidity = market.liquidityUsd;

  const parts: number[] = [];
  const reasons: string[] = [];

  // Buy/sell ratio (up to 7)
  if (isNum(buys) && isNum(sells)) {
    const total = buys + sells;
    const buyRatio = total > 0 ? buys / total : 0.5;
    const pts = lerp(buyRatio, 0.45, 0.7, 0, 7);
    parts.push(pts);
    reasons.push(`buy/sell ${buys}/${sells} (${Math.round(buyRatio * 100)}% buys)`);
  }

  // Absolute buy count (up to 6)
  if (isNum(buys)) {
    const pts = lerp(buys, 20, 250, 0, 6);
    parts.push(pts);
    if (buys >= 50) reasons.push(`${buys} buys in the last hour`);
  }

  // Volume / liquidity turnover (up to 7)
  const turnover = ratio(volumeH1, liquidity);
  if (isNum(turnover)) {
    const pts = lerp(turnover, 0.2, 3, 0, 7);
    parts.push(pts);
    reasons.push(`1h volume ${Math.round((turnover ?? 0) * 100)}% of liquidity`);
  }

  // Buyer acceleration bonus from momentum (subtle)
  if (momentum?.hasSufficientHistory && isNum(momentum.buyerChangePct) && momentum.buyerChangePct > 0) {
    reasons.push(`unique buyers +${Math.round(momentum.buyerChangePct)}%`);
  }

  if (parts.length === 0) {
    return {
      category: "DEMAND",
      points: round1(MAX * 0.4),
      maxPoints: MAX,
      direction: "neutral",
      reason: "Insufficient transaction data to assess demand.",
    };
  }

  // Average available components scaled to MAX.
  const raw = parts.reduce((a, b) => a + b, 0);
  const availableMax = parts.length * (MAX / 3); // 3 components each worth ~1/3
  const points = clamp(round1((raw / (availableMax || 1)) * MAX), 0, MAX);
  const direction = points >= MAX * 0.55 ? "positive" : points <= MAX * 0.35 ? "negative" : "neutral";

  return {
    category: "DEMAND",
    points,
    maxPoints: MAX,
    direction,
    reason: reasons.length ? `Demand: ${reasons.slice(0, 3).join("; ")}.` : "Demand assessed.",
    evidence: { buys, sells, volumeH1, liquidity, turnover },
  };
}

function unavailable(): CategoryScore {
  return {
    category: "DEMAND",
    points: 0,
    maxPoints: MAX,
    direction: "neutral",
    reason: "Market/transaction data unavailable; demand not scored.",
  };
}
