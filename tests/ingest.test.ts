import { describe, expect, it, vi } from "vitest";
import { ingestTrade, type IngestDependencies } from "../src/services/wallet-monitor/ingest";
import { TtlDedupCache } from "../src/domain/dedup";
import type { NormalizedTrade } from "../src/domain/types";

function trade(over: Partial<NormalizedTrade> = {}): NormalizedTrade {
  return {
    wallet: "WALLET_A",
    tokenAddress: "TOKEN_X",
    side: "BUY",
    amountToken: 1000,
    amountUsd: 850,
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    signature: "SIG_1",
    providerEventId: null,
    source: "solana",
    idempotencyKey: "sig:SIG_1:WALLET_A",
    ...over,
  };
}

function deps(over: Partial<IngestDependencies> = {}): IngestDependencies {
  return {
    dedup: new TtlDedupCache(60_000),
    resolveEntity: async (wallet) => ({
      entityId: `ent-${wallet}`,
      entityType: "wallet",
      wallet,
      clusterId: null,
    }),
    recordEntry: async (entry) => [entry],
    requestScan: vi.fn(async () => void 0),
    ...over,
  };
}

describe("wallet-monitor ingestTrade", () => {
  it("processes a watched BUY and requests a scan", async () => {
    const d = deps();
    const res = await ingestTrade(trade(), d);
    expect(res.status).toBe("processed");
    expect(res.scanRequested).toBe(true);
    expect(d.requestScan).toHaveBeenCalledWith("TOKEN_X", "WATCHED_WALLET_BUY");
  });

  it("ignores duplicate trades by idempotency key", async () => {
    const d = deps();
    await ingestTrade(trade(), d);
    const res = await ingestTrade(trade(), d);
    expect(res.status).toBe("duplicate");
    expect(res.scanRequested).toBe(false);
  });

  it("ignores SELL side (no scan)", async () => {
    const res = await ingestTrade(trade({ side: "SELL", idempotencyKey: "sig:SELL:WALLET_A" }), deps());
    expect(res.status).toBe("ignored_side");
  });

  it("ignores unwatched wallets", async () => {
    const res = await ingestTrade(trade(), deps({ resolveEntity: async () => null }));
    expect(res.status).toBe("unwatched");
    expect(res.scanRequested).toBe(false);
  });

  it("routes FOMO entities with FOMO_BUY reason", async () => {
    const d = deps({
      resolveEntity: async (wallet) => ({
        entityId: "fomo1",
        entityType: "fomo",
        wallet,
        clusterId: null,
      }),
    });
    const res = await ingestTrade(trade(), d);
    expect(res.status).toBe("processed");
    expect(d.requestScan).toHaveBeenCalledWith("TOKEN_X", "FOMO_BUY");
  });
});
