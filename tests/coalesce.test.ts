import { describe, expect, it, vi } from "vitest";
import { ScanCoalescer } from "../src/services/scan-orchestrator/coalesce";
import type { FullScan } from "../src/services/scan-orchestrator";

function fakeScan(score: number): FullScan {
  return {
    bundle: {
      token: { chain: "solana", address: "T", symbol: "T", name: null, decimals: 6 },
      market: null,
      security: null,
      holders: null,
      momentum: null,
      walletIntel: null,
      social: null,
      missingSources: [],
      scannedAt: new Date(),
    },
    result: {
      token: { chain: "solana", address: "T", symbol: "T", name: null, decimals: 6 },
      score,
      confidence: 90,
      categories: [],
      positives: [],
      risks: [],
      criticalRisk: false,
      dataAgeMs: 0,
      missingSources: [],
      scannedAt: new Date(),
    },
    market: null,
  };
}

describe("scan coalescer", () => {
  it("deduplicates concurrent scans for the same token", async () => {
    const coalescer = new ScanCoalescer(15_000);
    const runner = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return fakeScan(80);
    });
    const [a, b, c] = await Promise.all([
      coalescer.run("T", runner),
      coalescer.run("T", runner),
      coalescer.run("T", runner),
    ]);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(a.result.score).toBe(80);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("reuses a fresh recent scan within the freshness window", async () => {
    const coalescer = new ScanCoalescer(60_000);
    const runner = vi.fn(async () => fakeScan(70));
    await coalescer.run("T", runner);
    await coalescer.run("T", runner);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("re-runs when forced", async () => {
    const coalescer = new ScanCoalescer(60_000);
    const runner = vi.fn(async () => fakeScan(70));
    await coalescer.run("T", runner);
    await coalescer.run("T", runner, { force: true });
    expect(runner).toHaveBeenCalledTimes(2);
  });
});
