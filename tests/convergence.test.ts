import { describe, expect, it } from "vitest";
import { analyzeConvergence, type ConvergenceEntry } from "../src/domain/convergence";

const now = new Date("2026-01-01T00:15:00Z");
const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);

function entry(over: Partial<ConvergenceEntry>): ConvergenceEntry {
  return {
    entityId: "e",
    entityType: "wallet",
    wallet: null,
    clusterId: null,
    enteredAt: at(1),
    amountUsd: 100,
    ...over,
  };
}

describe("convergence engine", () => {
  it("Case A: two independent wallets -> convergence count 2", () => {
    const res = analyzeConvergence(
      [
        entry({ entityId: "A", wallet: "WALLET_A", enteredAt: at(5) }),
        entry({ entityId: "B", wallet: "WALLET_B", enteredAt: at(2) }),
      ],
      { now, windowSeconds: 900, minEntities: 2 },
    );
    expect(res.uniqueWalletCount).toBe(2);
    expect(res.independentEntities).toBe(2);
    expect(res.clusterAdjustedCount).toBe(2);
    expect(res.isConvergence).toBe(true);
    expect(res.isStrong).toBe(false);
  });

  it("Case B: wallet + FOMO resolving to same wallet -> unique wallet count 1", () => {
    const res = analyzeConvergence(
      [
        entry({ entityId: "raw", entityType: "wallet", wallet: "WALLET_A", enteredAt: at(4) }),
        entry({ entityId: "fomo", entityType: "fomo", wallet: "WALLET_A", enteredAt: at(3) }),
      ],
      { now, windowSeconds: 900, minEntities: 2 },
    );
    expect(res.uniqueWalletCount).toBe(1);
    expect(res.independentEntities).toBe(1);
    expect(res.clusterAdjustedCount).toBe(1);
    expect(res.isConvergence).toBe(false);
  });

  it("Case C: same cluster reduces cluster-adjusted count", () => {
    const res = analyzeConvergence(
      [
        entry({ entityId: "A", wallet: "WA", clusterId: "C1", enteredAt: at(6) }),
        entry({ entityId: "B", wallet: "WB", clusterId: "C1", enteredAt: at(4) }),
        entry({ entityId: "C", wallet: "WC", clusterId: "C1", enteredAt: at(2) }),
      ],
      { now, windowSeconds: 900, minEntities: 2 },
    );
    expect(res.uniqueWalletCount).toBe(3);
    expect(res.independentEntities).toBe(3);
    expect(res.clusterAdjustedCount).toBe(1); // all one cluster
    expect(res.isConvergence).toBe(false);
  });

  it("Case D: 3 independent -> strong convergence", () => {
    const res = analyzeConvergence(
      [
        entry({ entityId: "A", wallet: "WA", enteredAt: at(6) }),
        entry({ entityId: "B", wallet: "WB", enteredAt: at(4) }),
        entry({ entityId: "C", wallet: "WC", enteredAt: at(2) }),
      ],
      { now, windowSeconds: 900, minEntities: 2, strongEntities: 3 },
    );
    expect(res.clusterAdjustedCount).toBe(3);
    expect(res.isStrong).toBe(true);
  });

  it("excludes entries outside the window", () => {
    const res = analyzeConvergence(
      [
        entry({ entityId: "A", wallet: "WA", enteredAt: at(2) }),
        entry({ entityId: "B", wallet: "WB", enteredAt: at(60) }), // 1h ago, outside 15m
      ],
      { now, windowSeconds: 900, minEntities: 2 },
    );
    expect(res.entityCount).toBe(1);
    expect(res.isConvergence).toBe(false);
  });

  it("mixed clusters and solos count correctly", () => {
    const res = analyzeConvergence(
      [
        entry({ entityId: "A", wallet: "WA", clusterId: "C1", enteredAt: at(6) }),
        entry({ entityId: "B", wallet: "WB", clusterId: "C1", enteredAt: at(5) }),
        entry({ entityId: "C", wallet: "WC", clusterId: null, enteredAt: at(4) }),
        entry({ entityId: "D", wallet: "WD", clusterId: null, enteredAt: at(3) }),
      ],
      { now, windowSeconds: 900, minEntities: 2, strongEntities: 3 },
    );
    // 1 cluster bucket (C1) + 2 solos = 3
    expect(res.clusterAdjustedCount).toBe(3);
    expect(res.isStrong).toBe(true);
  });
});
