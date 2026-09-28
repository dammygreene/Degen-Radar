import { getDb } from "../../db/client";
import { InMemoryEventInbox } from "./memory";
import { PostgresEventInbox } from "./repo";
import type { EventInbox } from "./types";

export * from "./types";
export { InMemoryEventInbox } from "./memory";
export { PostgresEventInbox } from "./repo";

let cached: EventInbox | null = null;

/**
 * Returns the durable Postgres inbox when a DB is configured, otherwise an
 * in-memory inbox (degraded mode). Durability guarantees only hold with Postgres.
 */
export function getEventInbox(): EventInbox {
  if (cached) return cached;
  cached = getDb() ? new PostgresEventInbox() : new InMemoryEventInbox();
  return cached;
}

export function resetEventInbox(): void {
  cached = null;
}
