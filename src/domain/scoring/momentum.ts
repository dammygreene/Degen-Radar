import { CATEGORY_MAX, type CategoryScore, type MomentumMetrics } from "../scans/types";
import { clamp, isNum, lerp, round1 } from "./util";

const MAX = CATEGORY_MAX.MOMENTUM;

/**
 * Momentum (10 pts). Rewards acceleration *with confirmation* — volume, price,
 * buyers and liquidity moving together. Insufficient history is marked.
 */
export function scoreMomentum(momentum: MomentumMetrics | null): CategoryScore {
  if (!momentum || !momentum.hasSufficientHistory) {
    return {
      category: "MOMENTUM",
      points: round1(MAX * 0.3),
      maxPoints: MAX,
      direction: "neutral",
      reason: "Insufficient snapshot history to compute momentum.",
      evidence: { hasSufficientHistory: momentum?.hasSufficientHistory ?? false },
    };
  }

  const components: { label: string; pts: number }[] = [];

  if (isNum(momentum.volumeChangePct)) {
    components.push({ label: `volume ${fmt(momentum.volumeChangePct)}`, pts: lerp(momentum.volumeChangePct, 0, 200, 0, 3) });
  }
  if (isNum(momentum.buyerChangePct)) {
    components.push({ label: `buyers ${fmt(momentum.buyerChangePct)}`, pts: lerp(momentum.buyerChangePct, 0, 100, 0, 3) });
  }
  if (isNum(momentum.priceChangePct)) {
    components.push({ label: `price ${fmt(momentum.priceChangePct)}`, pts: lerp(momentum.priceChangePct, 0, 100, 0, 2) });
  }
  if (isNum(momentum.liquidityChangePct)) {
    // Positive liquidity growth confirms momentum; sharp drops penalize.
    components.push({
      label: `liquidity ${fmt(momentum.liquidityChangePct)}`,
      pts: lerp(momentum.liquidityChangePct, -20, 40, -2, 2),
    });
  }

  if (components.length === 0) {
    return {
      category: "MOMENTUM",
      points: round1(MAX * 0.3),
      maxPoints: MAX,
      direction: "neutral",
      reason: "Momentum window present but no comparable metrics.",
    };
  }

  const raw = components.reduce((a, c) => a + c.pts, 0);
  const points = clamp(round1(raw), 0, MAX);
  const strongest = [...components].sort((a, b) => b.pts - a.pts).slice(0, 2).map((c) => c.label);
  const direction = points >= MAX * 0.55 ? "positive" : points <= MAX * 0.25 ? "negative" : "neutral";

  return {
    category: "MOMENTUM",
    points,
    maxPoints: MAX,
    direction,
    reason: `Momentum over ${Math.round(momentum.windowSeconds / 60)}m: ${strongest.join("; ")}.`,
    evidence: {
      windowSeconds: momentum.windowSeconds,
      volumeChangePct: momentum.volumeChangePct,
      buyerChangePct: momentum.buyerChangePct,
      priceChangePct: momentum.priceChangePct,
      liquidityChangePct: momentum.liquidityChangePct,
    },
  };
}

function fmt(pct: number): string {
  return `${pct > 0 ? "+" : ""}${Math.round(pct)}%`;
}
