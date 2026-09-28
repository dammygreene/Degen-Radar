import { randomUUID } from "node:crypto";
import type {
  EnqueueResult,
  EventInbox,
  InboxEvent,
  InboxEventInput,
} from "./types";

/**
 * In-memory EventInbox for tests and degraded (no-DB) mode. Mirrors the
 * semantics of the Drizzle-backed repo, including dedup on
 * (provider, idempotencyKey).
 */
export class InMemoryEventInbox implements EventInbox {
  private readonly byId = new Map<string, InboxEvent>();
  private readonly byKey = new Set<string>();

  private key(provider: string, idempotencyKey: string): string {
    return `${provider}::${idempotencyKey}`;
  }

  async enqueue(input: InboxEventInput): Promise<EnqueueResult> {
    const k = this.key(input.provider, input.idempotencyKey);
    if (this.byKey.has(k)) return { inserted: false, event: null };
    const event: InboxEvent = {
      ...input,
      id: randomUUID(),
      receivedAt: new Date(),
      processedAt: null,
      status: "PENDING",
      error: null,
      attemptCount: 0,
    };
    this.byKey.add(k);
    this.byId.set(event.id, event);
    return { inserted: true, event };
  }

  async claimPending(limit: number): Promise<InboxEvent[]> {
    const claimed: InboxEvent[] = [];
    for (const e of this.byId.values()) {
      if (claimed.length >= limit) break;
      if (e.status === "PENDING" || e.status === "FAILED") {
        e.status = "PROCESSING";
        e.attemptCount++;
        claimed.push(e);
      }
    }
    return claimed;
  }

  async markProcessed(id: string): Promise<void> {
    const e = this.byId.get(id);
    if (e) {
      e.status = "PROCESSED";
      e.processedAt = new Date();
      e.error = null;
    }
  }

  async markFailed(id: string, error: string): Promise<void> {
    const e = this.byId.get(id);
    if (e) {
      e.status = "FAILED";
      e.error = error;
    }
  }

  async get(id: string): Promise<InboxEvent | null> {
    return this.byId.get(id) ?? null;
  }

  /** Test helper. */
  size(): number {
    return this.byId.size;
  }
}
