import { describe, expect, it } from "vitest";
import { computeMomentum, type MomentumSnapshot } from "../src/domain/momentum";

function snap(over: Partial<MomentumSnapshot>): MomentumSnapshot {
  return {
    capturedAt: new Date("2026-01-01T00:00:00Z"),
    marketCapUsd: 10000,
    priceUsd: 0.001,
    liquidityUsd: 10000,
    volume1h: 10000,
    uniqueBuyers: 50,
    holders: 100,
    ...over,
  };
}

describe("momentum engine", () => {
  it("marks insufficient history with <2 snapshots", () => {
    const m = computeMomentum([snap({})]);
    expect(m.hasSufficientHistory).toBe(false);
    expect(m.volumeChangePct).toBeNull();
  });

  it("computes percentage changes across the window", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:15:00Z");
    const m = computeMomentum([
      snap({ capturedAt: t0, volume1h: 10000, uniqueBuyers: 50, holders: 100, marketCapUsd: 20000 }),
      snap({ capturedAt: t1, volume1h: 30000, uniqueBuyers: 87, holders: 137, marketCapUsd: 24000 }),
    ]);
    expect(m.hasSufficientHistory).toBe(true);
    expect(m.windowSeconds).toBe(900);
    expect(m.volumeChangePct).toBeCloseTo(200, 5);
    expect(m.buyerChangePct).toBeCloseTo(74, 5);
    expect(m.holderChangePct).toBeCloseTo(37, 5);
    expect(m.marketCapChangePct).toBeCloseTo(20, 5);
  });

  it("never divides by zero", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:05:00Z");
    const m = computeMomentum([
      snap({ capturedAt: t0, volume1h: 0, uniqueBuyers: 0, holders: 0 }),
      snap({ capturedAt: t1, volume1h: 5000, uniqueBuyers: 10, holders: 20 }),
    ]);
    expect(m.volumeChangePct).toBeNull();
    expect(m.buyerChangePct).toBeNull();
  });

  it("uses the two most recent snapshots when more are given", () => {
    const mk = (min: number, vol: number) =>
      snap({ capturedAt: new Date(`2026-01-01T00:${String(min).padStart(2, "0")}:00Z`), volume1h: vol });
    const m = computeMomentum([mk(0, 1000), mk(5, 2000), mk(10, 4000)]);
    // latest=4000 vs previous=2000 => +100%
    expect(m.volumeChangePct).toBeCloseTo(100, 5);
  });
});
