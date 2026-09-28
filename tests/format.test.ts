import { describe, expect, it } from "vitest";
import { formatPct, formatUsd, shortenAddress } from "../src/utils/format";
import { renderConvergence, renderRadarSignal } from "../src/domain/alerts/templates";
import type { ScanResult } from "../src/domain/scans/types";
import type { ConvergenceResult } from "../src/domain/convergence";

describe("number formatting", () => {
  it("formats USD compactly", () => {
    expect(formatUsd(34800)).toBe("$34.8K");
    expect(formatUsd(1_500_000)).toBe("$1.50M");
    expect(formatUsd(null)).toBe("n/a");
  });
  it("formats percentages with optional sign", () => {
    expect(formatPct(42)).toBe("42%");
    expect(formatPct(42, { sign: true })).toBe("+42%");
  });
  it("shortens addresses", () => {
    expect(shortenAddress("So11111111111111111111111111111111111111112")).toMatch(/…/);
  });
});

const scan: ScanResult = {
  token: { chain: "solana", address: "TOK", symbol: "ABC", name: null, decimals: 6 },
  score: 86,
  confidence: 91,
  categories: [],
  positives: [
    { category: "WALLET_INTEL", points: 8, maxPoints: 10, direction: "positive", reason: "Watched wallet entered" },
    { category: "MOMENTUM", points: 8, maxPoints: 10, direction: "positive", reason: "Volume accelerating" },
  ],
  risks: [],
  criticalRisk: false,
  dataAgeMs: 18000,
  missingSources: [],
  scannedAt: new Date(),
};

describe("alert templates", () => {
  it("renders a radar signal with score, confidence and reasons", () => {
    const text = renderRadarSignal(scan, { marketCapUsd: 34800, liquidityUsd: 15700, ageMs: 42 * 60000 });
    expect(text).toContain("RADAR SIGNAL");
    expect(text).toContain("$ABC");
    expect(text).toContain("86/100");
    expect(text).toContain("91%");
    expect(text).toContain("Watched wallet entered");
  });

  it("renders convergence distinguishing entity vs unique wallet counts", () => {
    const conv: ConvergenceResult = {
      entityCount: 6,
      uniqueWalletCount: 5,
      fomoCount: 2,
      independentEntities: 5,
      clusterAdjustedCount: 5,
      isConvergence: true,
      isStrong: true,
      firstEntryAt: new Date("2026-01-01T00:00:00Z"),
      lastEntryAt: new Date("2026-01-01T00:11:00Z"),
      totalUsd: 5000,
      windowSeconds: 900,
    };
    const text = renderConvergence(scan, conv, { marketCapUsd: 34000, liquidityUsd: 16000 });
    expect(text).toContain("CONVERGENCE");
    expect(text).toContain("unique wallets");
    expect(text).toContain("FOMO account");
  });
});
