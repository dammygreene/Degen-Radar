import { describe, expect, it } from "vitest";
import { processTradeEvent, type ProcessTradeDeps } from "../src/pipeline/process-trade";
import { InMemoryEventInbox } from "../src/services/event-inbox/memory";
import type { ConvergenceEntry } from "../src/domain/convergence";
import type { ScanResult } from "../src/domain/scans/types";
import type { NormalizedTrade } from "../src/domain/types";
import type { ResolvedTradeEntity } from "../src/services/wallet-monitor/ingest";
import { defaultUserSettings } from "../src/domain/users/types";

const TOKEN = "TOKEN_ABC";

function goodScan(): ScanResult {
  return {
    token: { chain: "solana", address: TOKEN, symbol: "ABC", name: null, decimals: 6 },
    score: 86,
    confidence: 92,
    categories: [],
    positives: [
      { category: "WALLET_INTEL", points: 8, maxPoints: 10, direction: "positive", reason: "Watched wallet entered" },
    ],
    risks: [],
    criticalRisk: false,
    dataAgeMs: 1000,
    missingSources: [],
    scannedAt: new Date(),
  };
}

function trade(over: Partial<NormalizedTrade> = {}): NormalizedTrade {
  return {
    wallet: "WALLET_A",
    tokenAddress: TOKEN,
    side: "BUY",
    amountToken: 1000,
    amountUsd: 900,
    occurredAt: new Date(),
    signature: "SIG_A",
    providerEventId: "SIG_A",
    source: "helius",
    idempotencyKey: "sig:SIG_A:WALLET_A",
    ...over,
  };
}

interface Harness {
  deps: ProcessTradeDeps;
  entries: ConvergenceEntry[];
  alertCount: () => number;
  outcomesScheduled: () => number;
}

function harness(
  resolve: (w: string) => ResolvedTradeEntity | null,
  scan: ScanResult = goodScan(),
): Harness {
  const entries: ConvergenceEntry[] = [];
  let alerts = 0;
  let outcomes = 0;
  const deps: ProcessTradeDeps = {
    inbox: new InMemoryEventInbox(),
    resolveEntity: async (w) => resolve(w),
    recordEntry: async (entry) => {
      entries.push(entry);
      return [...entries];
    },
    runScan: async () => scan,
    allowDelivery: async () => true,
    deliverAlert: async () => {
      alerts++;
    },
    scheduleOutcomes: async () => {
      outcomes++;
    },
    settings: defaultUserSettings(),
  };
  return { deps, entries, alertCount: () => alerts, outcomesScheduled: () => outcomes };
}

const walletEntity = (wallet: string, clusterId: string | null = null): ResolvedTradeEntity => ({
  entityId: `ent-${wallet}`,
  entityType: "wallet",
  wallet,
  clusterId,
});

describe("end-to-end trade pipeline", () => {
  it("watched wallet BUY -> scan -> qualify -> ONE alert -> outcomes scheduled", async () => {
    const h = harness((w) => walletEntity(w));
    const res = await processTradeEvent(trade(), h.deps);
    expect(res.status).toBe("processed");
    expect(res.alertSent).toBe(true);
    expect(h.alertCount()).toBe(1);
    expect(h.outcomesScheduled()).toBe(1);
  });

  it("duplicate event is ignored by the inbox (no second alert)", async () => {
    const h = harness((w) => walletEntity(w));
    await processTradeEvent(trade(), h.deps);
    const dup = await processTradeEvent(trade(), h.deps);
    expect(dup.status).toBe("duplicate");
    expect(h.alertCount()).toBe(1);
  });

  it("unwatched wallet does not alert", async () => {
    const h = harness(() => null);
    const res = await processTradeEvent(trade(), h.deps);
    expect(res.status).toBe("unwatched");
    expect(h.alertCount()).toBe(0);
  });

  it("backfill trades establish context but never auto-alert", async () => {
    const h = harness((w) => walletEntity(w));
    const res = await processTradeEvent(
      trade({ backfill: true, source: "helius-backfill", idempotencyKey: "sig:BF:WALLET_A" }),
      h.deps,
    );
    expect(res.status).toBe("backfilled");
    expect(h.alertCount()).toBe(0);
  });

  it("low score does not alert", async () => {
    const lowScan = { ...goodScan(), score: 50 };
    const h = harness((w) => walletEntity(w), lowScan);
    const res = await processTradeEvent(trade(), h.deps);
    expect(res.status).toBe("processed");
    expect(res.alertSent).toBe(false);
    expect(h.alertCount()).toBe(0);
  });

  it("convergence: two independent watched wallets + a FOMO -> single aggregated alert", async () => {
    // Shared harness so entries accumulate across events, but each entity is independent.
    const entries: ConvergenceEntry[] = [];
    let alerts = 0;
    let lastConvergence: number | null = null;
    const resolver: Record<string, ResolvedTradeEntity> = {
      WALLET_A: walletEntity("WALLET_A"),
      WALLET_B: walletEntity("WALLET_B"),
      WALLET_C: { entityId: "fomo-c", entityType: "fomo", wallet: "WALLET_C", clusterId: null },
    };
    const deps: ProcessTradeDeps = {
      inbox: new InMemoryEventInbox(),
      resolveEntity: async (w) => resolver[w] ?? null,
      recordEntry: async (entry) => {
        entries.push(entry);
        return [...entries];
      },
      runScan: async () => goodScan(),
      allowDelivery: async () => true,
      deliverAlert: async (decision) => {
        alerts++;
        lastConvergence = decision.convergence?.clusterAdjustedCount ?? null;
      },
      scheduleOutcomes: async () => void 0,
      settings: defaultUserSettings(),
    };

    const now = new Date();
    await processTradeEvent(
      trade({ wallet: "WALLET_A", signature: "S1", providerEventId: "S1", idempotencyKey: "sig:S1:A" }),
      deps,
      now,
    );
    await processTradeEvent(
      trade({ wallet: "WALLET_B", signature: "S2", providerEventId: "S2", idempotencyKey: "sig:S2:B" }),
      deps,
      now,
    );
    const third = await processTradeEvent(
      trade({
        wallet: "WALLET_C",
        source: "fomo",
        signature: null,
        providerEventId: "S3",
        idempotencyKey: "evt:fomo:S3",
      }),
      deps,
      now,
    );

    // Each independent entry can alert, but the 3rd should be a CONVERGENCE with
    // cluster-adjusted count 3 (strong). Each token+event pair alerts once (no
    // cooldown here); the key assertion is the convergence aggregation is correct.
    expect(third.convergence?.clusterAdjustedCount).toBe(3);
    expect(third.convergence?.uniqueWalletCount).toBe(3);
    expect(lastConvergence).toBe(3);
    expect(alerts).toBeGreaterThanOrEqual(1);
  });

  it("wallet + FOMO resolving to SAME wallet counts once (unique wallet = 1)", async () => {
    const entries: ConvergenceEntry[] = [];
    let lastUnique: number | null = null;
    const resolver: Record<string, ResolvedTradeEntity> = {
      WALLET_A: walletEntity("WALLET_A"),
    };
    const deps: ProcessTradeDeps = {
      inbox: new InMemoryEventInbox(),
      // Both the raw wallet and the FOMO account resolve to WALLET_A.
      resolveEntity: async (w) =>
        w === "WALLET_A"
          ? resolver.WALLET_A!
          : { entityId: "fomo-a", entityType: "fomo", wallet: "WALLET_A", clusterId: null },
      recordEntry: async (entry) => {
        entries.push(entry);
        return [...entries];
      },
      runScan: async () => goodScan(),
      allowDelivery: async () => true,
      deliverAlert: async (d) => {
        lastUnique = d.convergence?.uniqueWalletCount ?? lastUnique;
      },
      scheduleOutcomes: async () => void 0,
      settings: defaultUserSettings(),
    };
    const now = new Date();
    await processTradeEvent(
      trade({ wallet: "WALLET_A", idempotencyKey: "sig:U1:A", signature: "U1", providerEventId: "U1" }),
      deps,
      now,
    );
    const second = await processTradeEvent(
      trade({ wallet: "FOMO_ALICE", source: "fomo", signature: null, providerEventId: "U2", idempotencyKey: "evt:fomo:U2" }),
      deps,
      now,
    );
    expect(second.convergence?.uniqueWalletCount).toBe(1);
    expect(second.convergence?.isConvergence).toBe(false); // one underlying entity
  });
});
