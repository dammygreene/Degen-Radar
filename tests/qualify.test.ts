import { describe, expect, it } from "vitest";
import { qualifiesForAlert } from "../src/domain/alerts/qualify";
import { defaultUserSettings } from "../src/domain/users/types";
import type { ScanResult } from "../src/domain/scans/types";

function scan(over: Partial<ScanResult> = {}): ScanResult {
  return {
    token: { chain: "solana", address: "TOK", symbol: "ABC", name: null, decimals: 6 },
    score: 84,
    confidence: 91,
    categories: [],
    positives: [],
    risks: [],
    criticalRisk: false,
    dataAgeMs: 1000,
    missingSources: [],
    scannedAt: new Date(),
    ...over,
  };
}

describe("alert qualification", () => {
  const settings = defaultUserSettings();

  it("qualifies a strong scan within universe", () => {
    const res = qualifiesForAlert(
      scan(),
      { alertType: "WATCHED_WALLET_SIGNAL", marketCapUsd: 34000, liquidityUsd: 16000 },
      settings,
    );
    expect(res.qualifies).toBe(true);
  });

  it("rejects below-threshold score", () => {
    const res = qualifiesForAlert(
      scan({ score: 60 }),
      { alertType: "WATCHED_WALLET_SIGNAL", marketCapUsd: 34000, liquidityUsd: 16000 },
      settings,
    );
    expect(res.qualifies).toBe(false);
    expect(res.reasons.join()).toContain("score");
  });

  it("rejects critical risk regardless of score", () => {
    const res = qualifiesForAlert(
      scan({ criticalRisk: true }),
      { alertType: "WATCHED_WALLET_SIGNAL", marketCapUsd: 34000, liquidityUsd: 16000 },
      settings,
    );
    expect(res.qualifies).toBe(false);
  });

  it("rejects liquidity below floor", () => {
    const res = qualifiesForAlert(
      scan(),
      { alertType: "WATCHED_WALLET_SIGNAL", marketCapUsd: 34000, liquidityUsd: 2000 },
      settings,
    );
    expect(res.qualifies).toBe(false);
  });

  it("enforces market cap universe bounds", () => {
    const tooBig = qualifiesForAlert(
      scan(),
      { alertType: "WATCHED_WALLET_SIGNAL", marketCapUsd: 200000, liquidityUsd: 16000 },
      settings,
    );
    expect(tooBig.qualifies).toBe(false);
  });

  it("convergence requires minimum independent entities", () => {
    const one = qualifiesForAlert(
      scan(),
      { alertType: "CONVERGENCE", independentEntities: 1, marketCapUsd: 34000, liquidityUsd: 16000 },
      settings,
    );
    expect(one.qualifies).toBe(false);

    const three = qualifiesForAlert(
      scan(),
      { alertType: "CONVERGENCE", independentEntities: 3, marketCapUsd: 34000, liquidityUsd: 16000 },
      settings,
    );
    expect(three.qualifies).toBe(true);
    expect(three.reasons.join()).toContain("strong convergence");
  });

  it("respects alertEnabled=false", () => {
    const res = qualifiesForAlert(
      scan(),
      { alertType: "WATCHED_WALLET_SIGNAL", marketCapUsd: 34000, liquidityUsd: 16000 },
      defaultUserSettings({ alertEnabled: false }),
    );
    expect(res.qualifies).toBe(false);
  });
});
