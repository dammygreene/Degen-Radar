import { computeTradeIdempotencyKey, TtlDedupCache } from "../../domain/dedup";
import type { ConvergenceEntry } from "../../domain/convergence";
import { analyzeConvergence } from "../../domain/convergence";
import type { NormalizedTrade } from "../../domain/types";
import { getConfig } from "../../config";

export interface IngestDependencies {
  dedup: TtlDedupCache;
  /** Resolve a wallet -> watched entity for the user base (null if unwatched). */
  resolveEntity: (wallet: string) => Promise<ResolvedTradeEntity | null>;
  /** Persist/record an entry and return recent entries for the token's window. */
  recordEntry: (entry: ConvergenceEntry, tokenAddress: string) => Promise<ConvergenceEntry[]>;
  /** Enqueue a scan (returns true if queued, false if inline needed). */
  requestScan: (tokenAddress: string, reason: "WATCHED_WALLET_BUY" | "FOMO_BUY") => Promise<void>;
}

export interface ResolvedTradeEntity {
  entityId: string;
  entityType: "wallet" | "fomo";
  wallet: string;
  clusterId: string | null;
}

export interface IngestResult {
  status: "duplicate" | "unwatched" | "ignored_side" | "processed";
  idempotencyKey: string;
  scanRequested: boolean;
  convergence?: ReturnType<typeof analyzeConvergence>;
}

/**
 * Core detection path for a normalized trade:
 *  1. dedup by idempotency key (in-memory fast path; DB unique constraint is the
 *     durable guarantee)
 *  2. only BUYs from *watched* entities trigger scans
 *  3. record the entry and evaluate convergence
 *  4. request a scan (coalesced upstream via jobId = token address)
 */
export async function ingestTrade(
  trade: NormalizedTrade,
  deps: IngestDependencies,
  now: Date = new Date(),
): Promise<IngestResult> {
  const key =
    trade.idempotencyKey ||
    computeTradeIdempotencyKey({
      wallet: trade.wallet,
      tokenAddress: trade.tokenAddress,
      side: trade.side,
      occurredAt: trade.occurredAt,
      amountUsd: trade.amountUsd,
      signature: trade.signature,
      providerEventId: trade.providerEventId,
      source: trade.source,
    });

  if (!deps.dedup.add(key, now.getTime())) {
    return { status: "duplicate", idempotencyKey: key, scanRequested: false };
  }

  if (trade.side !== "BUY") {
    return { status: "ignored_side", idempotencyKey: key, scanRequested: false };
  }

  const entity = await deps.resolveEntity(trade.wallet);
  if (!entity) {
    return { status: "unwatched", idempotencyKey: key, scanRequested: false };
  }

  const entry: ConvergenceEntry = {
    entityId: entity.entityId,
    entityType: entity.entityType,
    wallet: entity.wallet,
    clusterId: entity.clusterId,
    enteredAt: trade.occurredAt,
    amountUsd: trade.amountUsd,
  };

  const recent = await deps.recordEntry(entry, trade.tokenAddress);
  const cfg = getConfig();
  const convergence = analyzeConvergence(recent, {
    windowSeconds: cfg.alerts.convergenceWindowSeconds,
    minEntities: cfg.alerts.convergenceMinEntities,
    now,
  });

  await deps.requestScan(
    trade.tokenAddress,
    entity.entityType === "fomo" ? "FOMO_BUY" : "WATCHED_WALLET_BUY",
  );

  return { status: "processed", idempotencyKey: key, scanRequested: true, convergence };
}
