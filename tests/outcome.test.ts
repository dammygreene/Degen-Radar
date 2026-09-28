import { describe, expect, it } from "vitest";
import {
  buildCheckpointSchedule,
  computeOutcomeMetrics,
  type OutcomePoint,
} from "../src/services/outcome-tracker/checkpoints";

describe("outcome checkpoints", () => {
  it("schedules all 8 future checkpoints", () => {
    const schedule = buildCheckpointSchedule(new Date("2026-01-01T00:00:00Z"));
    expect(schedule.map((s) => s.checkpoint)).toEqual([
      "15m",
      "30m",
      "1h",
      "3h",
      "6h",
      "12h",
      "24h",
      "7d",
    ]);
    expect(schedule[0]!.delayMs).toBe(15 * 60_000);
    expect(schedule[7]!.delayMs).toBe(7 * 24 * 60 * 60_000);
  });

  it("computes peak, multiple, time-to-peak and drawdown", () => {
    const t = (min: number) => new Date(new Date("2026-01-01T00:00:00Z").getTime() + min * 60_000);
    const detection: OutcomePoint = { checkpoint: "detection", capturedAt: t(0), marketCapUsd: 30000 };
    const future: OutcomePoint[] = [
      { checkpoint: "15m", capturedAt: t(15), marketCapUsd: 60000 },
      { checkpoint: "30m", capturedAt: t(30), marketCapUsd: 120000 }, // peak 4x
      { checkpoint: "1h", capturedAt: t(60), marketCapUsd: 45000 }, // drawdown from peak
    ];
    const m = computeOutcomeMetrics(detection, future);
    expect(m.peakMarketCapUsd).toBe(120000);
    expect(m.peakMultiple).toBeCloseTo(4, 5);
    expect(m.timeToPeakMs).toBe(30 * 60_000);
    // Max drawdown: from 120k down to 45k => 62.5% -> 63 rounded
    expect(m.maxDrawdownPct).toBe(63);
    expect(m.liquiditySurvived).toBe(true);
  });

  it("handles missing detection market cap gracefully", () => {
    const m = computeOutcomeMetrics(
      { checkpoint: "detection", capturedAt: new Date(), marketCapUsd: null },
      [],
    );
    expect(m.peakMultiple).toBeNull();
    expect(m.maxDrawdownPct).toBeNull();
  });
});
