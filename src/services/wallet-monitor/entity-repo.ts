import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "../../db/client";
import { tokens, walletTrades, wallets, watchedEntities } from "../../db/schema";
import type { ConvergenceEntry } from "../../domain/convergence";
import type { NormalizedTrade } from "../../domain/types";
import type { ResolvedTradeEntity } from "./ingest";
import { logger } from "../../utils/logger";

/**
 * Resolve a wallet address to a watched entity (across the watchlist). Also
 * loads the wallet's cluster id so convergence can collapse related wallets.
 * Returns null when the wallet is not watched or no DB is configured.
 */
export async function resolveWatchedEntity(wallet: string): Promise<ResolvedTradeEntity | null> {
  const db = getDb();
  if (!db) return null;
  const entity = await db.query.watchedEntities.findFirst({
    where: and(eq(watchedEntities.walletAddress, wallet), eq(watchedEntities.enabled, true)),
  });
  if (!entity) return null;
  const walletRow = await db.query.wallets.findFirst({ where: eq(wallets.address, wallet) });
  return {
    entityId: entity.id,
    entityType: entity.entityType as "wallet" | "fomo",
    wallet,
    clusterId: walletRow?.clusterId ?? null,
  };
}

/** Ensure a wallet + token row exist and persist the trade (idempotent). */
export async function persistTrade(trade: NormalizedTrade): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const [walletRow] = await db
      .insert(wallets)
      .values({ address: trade.wallet, chain: "solana", lastSeenAt: new Date() })
      .onConflictDoUpdate({ target: wallets.address, set: { lastSeenAt: new Date() } })
      .returning({ id: wallets.id });
    const [tokenRow] = await db
      .insert(tokens)
      .values({ address: trade.tokenAddress, chain: "solana" })
      .onConflictDoUpdate({ target: tokens.address, set: { lastSeenAt: new Date() } })
      .returning({ id: tokens.id });

    await db
      .insert(walletTrades)
      .values({
        walletId: walletRow!.id,
        tokenId: tokenRow!.id,
        side: trade.side,
        signature: trade.signature,
        providerEventId: trade.providerEventId,
        idempotencyKey: trade.idempotencyKey,
        amountToken: trade.amountToken != null ? String(trade.amountToken) : null,
        amountUsd: trade.amountUsd != null ? String(trade.amountUsd) : null,
        occurredAt: trade.occurredAt,
        source: trade.source,
        raw: trade as unknown as object,
      })
      .onConflictDoNothing({ target: walletTrades.idempotencyKey });
  } catch (err) {
    logger.warn({ err, wallet: trade.wallet }, "persistTrade failed");
  }
}

/**
 * Record a convergence entry (via persisting the trade) and return recent
 * watched-entity entries for the token within the window. Derived from
 * wallet_trades joined against the watchlist so identity/cluster collapsing can
 * run in the convergence engine.
 */
export async function recordAndLoadEntries(
  entry: ConvergenceEntry,
  tokenAddress: string,
  windowSeconds: number,
): Promise<ConvergenceEntry[]> {
  const db = getDb();
  if (!db) return [entry];

  const tokenRow = await db.query.tokens.findFirst({ where: eq(tokens.address, tokenAddress) });
  if (!tokenRow) return [entry];

  const since = new Date(Date.now() - windowSeconds * 1000);
  const rows = await db
    .select({
      walletAddress: wallets.address,
      clusterId: wallets.clusterId,
      occurredAt: walletTrades.occurredAt,
      amountUsd: walletTrades.amountUsd,
      entityId: watchedEntities.id,
      entityType: watchedEntities.entityType,
    })
    .from(walletTrades)
    .innerJoin(wallets, eq(walletTrades.walletId, wallets.id))
    .innerJoin(
      watchedEntities,
      and(eq(watchedEntities.walletAddress, wallets.address), eq(watchedEntities.enabled, true)),
    )
    .where(
      and(
        eq(walletTrades.tokenId, tokenRow.id),
        eq(walletTrades.side, "BUY"),
        gte(walletTrades.occurredAt, since),
      ),
    )
    .orderBy(desc(walletTrades.occurredAt))
    .limit(200);

  if (rows.length === 0) return [entry];

  return rows.map((r) => ({
    entityId: r.entityId,
    entityType: r.entityType as "wallet" | "fomo",
    wallet: r.walletAddress,
    clusterId: r.clusterId,
    enteredAt: r.occurredAt,
    amountUsd: r.amountUsd != null ? Number(r.amountUsd) : null,
  }));
}
