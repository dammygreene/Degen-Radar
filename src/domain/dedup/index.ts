import { createHash } from "node:crypto";
import type { TradeSide } from "../types";

export interface RawTradeIdentity {
  wallet: string;
  tokenAddress: string;
  side: TradeSide;
  occurredAt: Date;
  amountUsd?: number | null;
  signature?: string | null;
  providerEventId?: string | null;
  source: string;
}

/**
 * Deterministic idempotency key for an ingested trade.
 *
 * Preference order (blueprint / build-prompt):
 *  1. Solana signature + wallet   -> `sig:<signature>:<wallet>`
 *  2. Provider event id           -> `evt:<source>:<providerEventId>`
 *  3. Fallback hash of trader + token + side + time bucket + size
 *
 * The fallback buckets time into 60s windows so near-duplicate polled events
 * collapse, while genuinely distinct trades stay distinct.
 */
export function computeTradeIdempotencyKey(
  trade: RawTradeIdentity,
  bucketSeconds = 60,
): string {
  if (trade.signature) {
    return `sig:${trade.signature}:${trade.wallet}`;
  }
  if (trade.providerEventId) {
    return `evt:${trade.source}:${trade.providerEventId}`;
  }
  const bucket = Math.floor(trade.occurredAt.getTime() / 1000 / bucketSeconds);
  const sizeBucket =
    typeof trade.amountUsd === "number" && Number.isFinite(trade.amountUsd)
      ? Math.round(trade.amountUsd)
      : "na";
  const raw = [trade.wallet, trade.tokenAddress, trade.side, bucket, sizeBucket].join("|");
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return `hash:${hash}`;
}

/**
 * In-memory dedup cache with TTL. Production also relies on a DB unique
 * constraint on the idempotency key — this is a fast first line of defense.
 */
export class TtlDedupCache {
  private readonly seen = new Map<string, number>();
  constructor(private readonly ttlMs: number = 60 * 60 * 1000) {}

  /** Returns true if key is new (and records it); false if it was a duplicate. */
  add(key: string, now = Date.now()): boolean {
    this.evict(now);
    if (this.seen.has(key)) return false;
    this.seen.set(key, now + this.ttlMs);
    return true;
  }

  has(key: string, now = Date.now()): boolean {
    const exp = this.seen.get(key);
    if (exp === undefined) return false;
    if (exp < now) {
      this.seen.delete(key);
      return false;
    }
    return true;
  }

  private evict(now: number): void {
    for (const [key, exp] of this.seen) {
      if (exp < now) this.seen.delete(key);
    }
  }

  get size(): number {
    return this.seen.size;
  }
}
