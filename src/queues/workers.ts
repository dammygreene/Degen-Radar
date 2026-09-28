import { Worker, type Processor } from "bullmq";
import { getDb } from "../db/client";
import { outcomeSnapshots, tokens } from "../db/schema";
import { eq } from "drizzle-orm";
import type { NormalizedTrade } from "../domain/types";
import { processTradeEvent } from "../pipeline/process-trade";
import { buildProcessTradeDeps } from "../pipeline/wiring";
import { scanToken } from "../services/scan-orchestrator";
import { persistTrade } from "../services/wallet-monitor/entity-repo";
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

  // chain-events: normalized trades (Helius webhook / FOMO realtime) -> pipeline.
  const chainWorker = makeWorker("chain-events", async (job) => {
    const { trade } = job.data as { trade: NormalizedTrade };
    // Rehydrate Date fields lost through JSON serialization.
    const normalized: NormalizedTrade = { ...trade, occurredAt: new Date(trade.occurredAt) };
    await persistTrade(normalized);
    const result = await processTradeEvent(normalized, buildProcessTradeDeps());
    return { status: result.status, alertSent: result.alertSent };
  });
  if (chainWorker) started++;

  // token-scans: explicit scan requests.
  const scanWorker = makeWorker("token-scans", async (job) => {
    const data = job.data as TokenScanRequestedPayload;
    const { result } = await scanToken(data.tokenAddress, {
      reason: data.reason,
    });
    return { score: result.score, confidence: result.confidence };
  });
  if (scanWorker) started++;

  // outcomes: durable delayed checkpoint snapshots.
  const outcomeWorker = makeWorker("outcomes", async (job) => {
    const { tokenAddress, checkpoint, detectionScanId } = job.data as {
      tokenAddress: string;
      checkpoint: string;
      detectionScanId: string | null;
    };
    const { result, market } = await scanToken(tokenAddress, { reason: "MOMENTUM" });
    await persistOutcomeSnapshot(tokenAddress, checkpoint, detectionScanId, result.score, result.confidence, market);
    logger.info({ tokenAddress, checkpoint, score: result.score }, "outcome snapshot captured");
    return { checkpoint, score: result.score };
  });
  if (outcomeWorker) started++;

  // Passthrough workers for the remaining pipeline stages (extend as needed).
  for (const name of ["discovery", "wallet-intel", "x-intel", "scoring", "alerts"] as QueueName[]) {
    const w = makeWorker(name, async (job) => {
      logger.debug({ queue: name, jobId: job.id }, "processed passthrough job");
      return true;
    });
    if (w) started++;
  }

  return started;
}

async function persistOutcomeSnapshot(
  tokenAddress: string,
  checkpoint: string,
  detectionScanId: string | null,
  score: number,
  confidence: number,
  market: { marketCapUsd: number | null; liquidityUsd: number | null; priceUsd: number | null } | null,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const token = await db.query.tokens.findFirst({ where: eq(tokens.address, tokenAddress) });
  if (!token) return;
  await db
    .insert(outcomeSnapshots)
    .values({
      tokenId: token.id,
      detectionScanId,
      checkpoint,
      marketCapUsd: market?.marketCapUsd != null ? String(market.marketCapUsd) : null,
      liquidityUsd: market?.liquidityUsd != null ? String(market.liquidityUsd) : null,
      priceUsd: market?.priceUsd != null ? String(market.priceUsd) : null,
      radarScore: score,
      confidence,
    })
    .onConflictDoNothing({
      target: [outcomeSnapshots.tokenId, outcomeSnapshots.detectionScanId, outcomeSnapshots.checkpoint],
    });
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close().catch(() => void 0)));
  workers.length = 0;
}
