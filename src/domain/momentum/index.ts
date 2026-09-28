import { ageSeconds } from "../../utils/time";
import type { MomentumMetrics } from "../scans/types";
import { pctChange } from "../scoring/util";

/** Minimal snapshot shape needed to compute momentum. */
export interface MomentumSnapshot {
  capturedAt: Date;
  marketCapUsd: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume1h: number | null;
  uniqueBuyers: number | null;
  holders: number | null;
}

export interface MomentumOptions {
  /** Minimum seconds between snapshots to consider history "sufficient". */
  minWindowSeconds?: number;
}

/**
 * Compute momentum by comparing the latest snapshot to the most recent earlier
 * snapshot. All comparisons include a window; insufficient history is marked
 * rather than guessed, and division-by-zero is impossible (pctChange guards).
 */
export function computeMomentum(
  snapshots: readonly MomentumSnapshot[],
  opts: MomentumOptions = {},
): MomentumMetrics {
  const minWindow = opts.minWindowSeconds ?? 60;

  if (snapshots.length < 2) {
    return {
      windowSeconds: 0,
      hasSufficientHistory: false,
      marketCapChangePct: null,
      priceChangePct: null,
      volumeChangePct: null,
      buyerChangePct: null,
      holderChangePct: null,
      liquidityChangePct: null,
    };
  }

  const sorted = [...snapshots].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const latest = sorted[sorted.length - 1]!;
  const previous = sorted[sorted.length - 2]!;
  const windowSeconds = Math.max(0, ageSeconds(previous.capturedAt, latest.capturedAt));

  return {
    windowSeconds,
    hasSufficientHistory: windowSeconds >= minWindow,
    marketCapChangePct: pctChange(previous.marketCapUsd, latest.marketCapUsd),
    priceChangePct: pctChange(previous.priceUsd, latest.priceUsd),
    volumeChangePct: pctChange(previous.volume1h, latest.volume1h),
    buyerChangePct: pctChange(previous.uniqueBuyers, latest.uniqueBuyers),
    holderChangePct: pctChange(previous.holders, latest.holders),
    liquidityChangePct: pctChange(previous.liquidityUsd, latest.liquidityUsd),
  };
}
