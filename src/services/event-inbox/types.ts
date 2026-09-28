export type InboxStatus = "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED";

export interface InboxEventInput {
  eventType: string;
  provider: string;
  providerEventId: string | null;
  idempotencyKey: string;
  occurredAt: Date | null;
  payload: unknown;
}

export interface InboxEvent extends InboxEventInput {
  id: string;
  receivedAt: Date;
  processedAt: Date | null;
  status: InboxStatus;
  error: string | null;
  attemptCount: number;
}

export interface EnqueueResult {
  inserted: boolean; // false => duplicate (already present)
  event: InboxEvent | null;
}

/**
 * Durable event inbox. The unique (provider, idempotencyKey) constraint is the
 * authoritative dedup guarantee — protecting against provider retries, websocket
 * replay, duplicated webhooks, worker retries and process restarts. (§10)
 */
export interface EventInbox {
  enqueue(input: InboxEventInput): Promise<EnqueueResult>;
  claimPending(limit: number): Promise<InboxEvent[]>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  get(id: string): Promise<InboxEvent | null>;
}
