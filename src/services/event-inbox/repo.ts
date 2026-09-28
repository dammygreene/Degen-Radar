import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { eventInbox } from "../../db/schema";
import { logger } from "../../utils/logger";
import type {
  EnqueueResult,
  EventInbox,
  InboxEvent,
  InboxEventInput,
} from "./types";

function toEvent(row: typeof eventInbox.$inferSelect): InboxEvent {
  return {
    id: row.id,
    eventType: row.eventType,
    provider: row.provider,
    providerEventId: row.providerEventId,
    idempotencyKey: row.idempotencyKey,
    occurredAt: row.occurredAt,
    receivedAt: row.receivedAt,
    processedAt: row.processedAt,
    status: row.status as InboxEvent["status"],
    error: row.error,
    attemptCount: row.attemptCount,
    payload: row.payload,
  };
}

/** Drizzle/Postgres-backed durable event inbox. */
export class PostgresEventInbox implements EventInbox {
  async enqueue(input: InboxEventInput): Promise<EnqueueResult> {
    const db = getDb();
    if (!db) throw new Error("Database not configured");
    // ON CONFLICT DO NOTHING gives us atomic dedup on (provider, idempotencyKey).
    const rows = await db
      .insert(eventInbox)
      .values({
        eventType: input.eventType,
        provider: input.provider,
        providerEventId: input.providerEventId,
        idempotencyKey: input.idempotencyKey,
        occurredAt: input.occurredAt ?? undefined,
        payload: input.payload as object,
        status: "PENDING",
      })
      .onConflictDoNothing({ target: [eventInbox.provider, eventInbox.idempotencyKey] })
      .returning();
    if (rows.length === 0) return { inserted: false, event: null };
    return { inserted: true, event: toEvent(rows[0]!) };
  }

  async claimPending(limit: number): Promise<InboxEvent[]> {
    const db = getDb();
    if (!db) throw new Error("Database not configured");
    // Atomically claim using a CTE + FOR UPDATE SKIP LOCKED semantics.
    const rows = await db.transaction(async (tx) => {
      const pending = await tx
        .select({ id: eventInbox.id })
        .from(eventInbox)
        .where(or(eq(eventInbox.status, "PENDING"), eq(eventInbox.status, "FAILED")))
        .limit(limit)
        .for("update", { skipLocked: true });
      const ids = pending.map((p) => p.id);
      if (ids.length === 0) return [];
      const updated = await tx
        .update(eventInbox)
        .set({ status: "PROCESSING", attemptCount: sql`${eventInbox.attemptCount} + 1` })
        .where(inArray(eventInbox.id, ids))
        .returning();
      return updated;
    });
    return rows.map(toEvent);
  }

  async markProcessed(id: string): Promise<void> {
    const db = getDb();
    if (!db) throw new Error("Database not configured");
    await db
      .update(eventInbox)
      .set({ status: "PROCESSED", processedAt: new Date(), error: null })
      .where(eq(eventInbox.id, id));
  }

  async markFailed(id: string, error: string): Promise<void> {
    const db = getDb();
    if (!db) throw new Error("Database not configured");
    await db
      .update(eventInbox)
      .set({ status: "FAILED", error: error.slice(0, 2000) })
      .where(and(eq(eventInbox.id, id)));
    logger.warn({ id, error }, "inbox event marked failed");
  }

  async get(id: string): Promise<InboxEvent | null> {
    const db = getDb();
    if (!db) return null;
    const row = await db.query.eventInbox.findFirst({ where: eq(eventInbox.id, id) });
    return row ? toEvent(row) : null;
  }
}
