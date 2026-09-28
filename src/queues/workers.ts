import { Worker, type Processor } from "bullmq";
import { scanToken } from "../services/scan-orchestrator";
import type { TokenScanRequestedPayload } from "../events/types";
import { logger } from "../utils/logger";
import { getRedis } from "./connection";
import type { QueueName } from "./index";

const workers: Worker[] = [];

function makeWorker(name: QueueName, processor: Processor): Worker | null {
  const connection = getRedis();
  if (!connection) return null;
  const w = new Worker(name, processor, { connection, concurrency: 5 });
  w.on("failed", (job, err) => logger.error({ queue: name, jobId: job?.id, err }, "job failed"));
  w.on("completed", (job) => logger.debug({ queue: name, jobId: job.id }, "job completed"));
  workers.push(w);
  return w;
}

/**
 * Register all queue workers. Returns the number started (0 in degraded mode).
 * Each worker maps a durable job onto a domain service.
 */
export function startWorkers(): number {
  let started = 0;

  const scanWorker = makeWorker("token-scans", async (job) => {
    const data = job.data as TokenScanRequestedPayload;
    const { result } = await scanToken(data.tokenAddress, {
      reason: data.reason,
      triggerEntityId: data.triggerEntityId ?? null,
    } as never);
    return { score: result.score, confidence: result.confidence };
  });
  if (scanWorker) started++;

  const outcomeWorker = makeWorker("outcomes", async (job) => {
    const { tokenAddress, checkpoint } = job.data as { tokenAddress: string; checkpoint: string };
    const { result, market } = await scanToken(tokenAddress, { reason: "MOMENTUM" });
    logger.info(
      { tokenAddress, checkpoint, marketCapUsd: market?.marketCapUsd, score: result.score },
      "outcome snapshot captured",
    );
    return { checkpoint, score: result.score };
  });
  if (outcomeWorker) started++;

  // Pass-through workers for the remaining pipeline stages (extend as needed).
  for (const name of ["discovery", "chain-events", "wallet-intel", "x-intel", "scoring", "alerts"] as QueueName[]) {
    const w = makeWorker(name, async (job) => {
      logger.debug({ queue: name, jobId: job.id }, "processed passthrough job");
      return true;
    });
    if (w) started++;
  }

  return started;
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close().catch(() => void 0)));
  workers.length = 0;
}
