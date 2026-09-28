import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { watchedEntities } from "../../db/schema";
import { ValidationError } from "../../utils/errors";
import { assertSolanaAddress, isValidHandle, normalizeHandle } from "../../utils/solana-address";
import { shortenAddress } from "../../utils/format";

export interface WatchedEntityRecord {
  id: string;
  entityType: "wallet" | "fomo";
  label: string | null;
  walletAddress: string | null;
  fomoHandle: string | null;
  enabled: boolean;
}

export async function addWatchedWallet(
  userId: string,
  address: string,
  label?: string,
): Promise<WatchedEntityRecord> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");
  const wallet = assertSolanaAddress(address);

  const existing = await db.query.watchedEntities.findFirst({
    where: and(eq(watchedEntities.userId, userId), eq(watchedEntities.walletAddress, wallet)),
  });
  if (existing) return toRecord(existing);

  const [row] = await db
    .insert(watchedEntities)
    .values({
      userId,
      entityType: "wallet",
      walletAddress: wallet,
      label: label ?? shortenAddress(wallet),
    })
    .returning();
  return toRecord(row!);
}

export async function addWatchedFomo(
  userId: string,
  handle: string,
  resolvedWallet: string | null,
  providerIdentity: string | null,
): Promise<WatchedEntityRecord> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");
  if (!isValidHandle(handle)) throw new ValidationError(`Invalid FOMO handle: ${handle}`);
  const normalized = normalizeHandle(handle);

  const existing = await db.query.watchedEntities.findFirst({
    where: and(eq(watchedEntities.userId, userId), eq(watchedEntities.fomoHandle, normalized)),
  });
  if (existing) return toRecord(existing);

  const [row] = await db
    .insert(watchedEntities)
    .values({
      userId,
      entityType: "fomo",
      fomoHandle: normalized,
      walletAddress: resolvedWallet,
      providerIdentity,
      label: `@${normalized}`,
    })
    .returning();
  return toRecord(row!);
}

export async function removeWatched(userId: string, addressOrHandle: string): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");
  const handle = normalizeHandle(addressOrHandle);
  const list = await listWatched(userId);
  const match = list.find(
    (e) => e.walletAddress === addressOrHandle.trim() || e.fomoHandle === handle,
  );
  if (!match) return false;
  await db.delete(watchedEntities).where(eq(watchedEntities.id, match.id));
  return true;
}

export async function listWatched(userId: string): Promise<WatchedEntityRecord[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.query.watchedEntities.findMany({
    where: eq(watchedEntities.userId, userId),
  });
  return rows.map(toRecord);
}

function toRecord(row: typeof watchedEntities.$inferSelect): WatchedEntityRecord {
  return {
    id: row.id,
    entityType: row.entityType as "wallet" | "fomo",
    label: row.label,
    walletAddress: row.walletAddress,
    fomoHandle: row.fomoHandle,
    enabled: row.enabled,
  };
}
