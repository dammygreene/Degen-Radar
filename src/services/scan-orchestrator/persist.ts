import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { scanSignals, scans, tokens } from "../../db/schema";
import type { FullScan } from "./index";
import type { ScanReason } from "../../domain/scans/types";
import { logger } from "../../utils/logger";

/** Upsert a token row by address, returning its internal id (or null if no DB). */
export async function upsertToken(scan: FullScan): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const t = scan.result.token;
  const [row] = await db
    .insert(tokens)
    .values({
      address: t.address,
      chain: t.chain,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      status: "tracking",
    })
    .onConflictDoUpdate({
      target: tokens.address,
      set: { lastSeenAt: new Date(), symbol: t.symbol, name: t.name },
    })
    .returning({ id: tokens.id });
  return row?.id ?? null;
}

/**
 * Persist a completed scan and its signals. Historical scan data is a core V1
 * asset — every scan is stored, not just returned over HTTP. (blueprint §33)
 */
export async function persistScan(
  scan: FullScan,
  meta: { triggerType: ScanReason; triggerEntityId?: string | null },
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const tokenId = await upsertToken(scan);
    if (!tokenId) return null;

    const [scanRow] = await db
      .insert(scans)
      .values({
        tokenId,
        triggerType: meta.triggerType,
        triggerEntityId: meta.triggerEntityId ?? null,
        status: scan.result.criticalRisk ? "SCORED" : "SCORED",
        startedAt: scan.result.scannedAt,
        completedAt: new Date(),
        score: scan.result.score,
        confidence: scan.result.confidence,
        missingSources: scan.result.missingSources,
      })
      .returning({ id: scans.id });

    const scanId = scanRow!.id;
    if (scan.result.categories.length > 0) {
      await db.insert(scanSignals).values(
        scan.result.categories.map((c) => ({
          scanId,
          category: c.category,
          direction: c.direction,
          points: String(c.points),
          maxPoints: String(c.maxPoints),
          reason: c.reason,
          evidence: (c.evidence ?? {}) as object,
        })),
      );
    }
    return scanId;
  } catch (err) {
    logger.error({ err, token: scan.result.token.address }, "persistScan failed");
    return null;
  }
}

/** Record a provider-health sample row (batch-friendly). */
export async function touchTokenSeen(address: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(tokens)
    .set({ lastSeenAt: sql`now()` })
    .where(eq(tokens.address, address));
}
