import { DAY, HOUR, MINUTE } from "../../utils/time";

export type Checkpoint = "detection" | "15m" | "30m" | "1h" | "3h" | "6h" | "12h" | "24h" | "7d";

export const CHECKPOINT_OFFSETS_MS: Record<Exclude<Checkpoint, "detection">, number> = {
  "15m": 15 * MINUTE,
  "30m": 30 * MINUTE,
  "1h": HOUR,
  "3h": 3 * HOUR,
  "6h": 6 * HOUR,
  "12h": 12 * HOUR,
  "24h": 24 * HOUR,
  "7d": 7 * DAY,
};

export interface ScheduledCheckpoint {
  checkpoint: Checkpoint;
  dueAt: Date;
  delayMs: number;
}

/** Build the durable schedule of future outcome snapshots from a detection time. */
export function buildCheckpointSchedule(detectedAt: Date): ScheduledCheckpoint[] {
  return (Object.entries(CHECKPOINT_OFFSETS_MS) as [Exclude<Checkpoint, "detection">, number][]).map(
    ([checkpoint, delayMs]) => ({
      checkpoint,
      delayMs,
      dueAt: new Date(detectedAt.getTime() + delayMs),
    }),
  );
}

export interface OutcomePoint {
  checkpoint: Checkpoint;
  capturedAt: Date;
  marketCapUsd: number | null;
}

export interface OutcomeMetrics {
  detectionMarketCapUsd: number | null;
  peakMarketCapUsd: number | null;
  peakMultiple: number | null;
  timeToPeakMs: number | null;
  maxDrawdownPct: number | null;
  liquiditySurvived: boolean | null;
}

/**
 * Reproducible outcome metrics from a detection snapshot + future snapshots.
 * Deterministic: same inputs always yield the same outcome.
 */
export function computeOutcomeMetrics(
  detection: OutcomePoint,
  future: readonly OutcomePoint[],
): OutcomeMetrics {
  const base = detection.marketCapUsd;
  const points = [detection, ...future].filter((p) => typeof p.marketCapUsd === "number");

  if (points.length === 0 || base == null || base <= 0) {
    return {
      detectionMarketCapUsd: base ?? null,
      peakMarketCapUsd: null,
      peakMultiple: null,
      timeToPeakMs: null,
      maxDrawdownPct: null,
      liquiditySurvived: null,
    };
  }

  let peak = points[0]!;
  for (const p of points) {
    if ((p.marketCapUsd ?? 0) > (peak.marketCapUsd ?? 0)) peak = p;
  }

  // Max drawdown = largest peak-to-trough decline across the ordered series.
  let runningPeak = -Infinity;
  let maxDrawdown = 0;
  for (const p of points) {
    const mc = p.marketCapUsd!;
    runningPeak = Math.max(runningPeak, mc);
    if (runningPeak > 0) {
      const dd = ((runningPeak - mc) / runningPeak) * 100;
      maxDrawdown = Math.max(maxDrawdown, dd);
    }
  }

  return {
    detectionMarketCapUsd: base,
    peakMarketCapUsd: peak.marketCapUsd ?? null,
    peakMultiple: peak.marketCapUsd ? peak.marketCapUsd / base : null,
    timeToPeakMs: peak.capturedAt.getTime() - detection.capturedAt.getTime(),
    maxDrawdownPct: Math.round(maxDrawdown),
    liquiditySurvived: (peak.marketCapUsd ?? 0) >= base * 0.5,
  };
}
