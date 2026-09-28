import { Queue } from "bullmq";
import { logger } from "../utils/logger";
import { getRedis } from "./connection";

export const QUEUE_NAMES = [
  "discovery",
  "chain-events",
  "token-scans",
  "wallet-intel",
  "x-intel",
  "scoring",
  "alerts",
  "outcomes",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

const queues = new Map<QueueName, Queue>();

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 1_000 },
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
};

/** Get (or lazily create) a queue. Returns null in degraded (no-Redis) mode. */
export function getQueue(name: QueueName): Queue | null {
  const connection = getRedis();
  if (!connection) return null;
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection, defaultJobOptions });
    queues.set(name, q);
  }
  return q;
}

export interface EnqueueOptions {
  jobId?: string;
  delayMs?: number;
}

/**
 * Enqueue a job. Returns false when queues are disabled so callers can decide
 * to run inline (see scan orchestrator) instead of silently dropping work.
 */
export async function enqueue(
  name: QueueName,
  jobName: string,
  data: unknown,
  opts: EnqueueOptions = {},
): Promise<boolean> {
  const q = getQueue(name);
  if (!q) return false;
  await q.add(jobName, data, {
    jobId: opts.jobId,
    delay: opts.delayMs,
  });
  return true;
}

export async function closeQueues(): Promise<void> {
  for (const q of queues.values()) {
    await q.close().catch((err) => logger.warn({ err }, "queue close failed"));
  }
  queues.clear();
}
