import { enqueue } from "../../queues";
import { logger } from "../../utils/logger";
import { buildCheckpointSchedule } from "./checkpoints";

/**
 * Schedule the full outcome-snapshot series as durable, delayed BullMQ jobs so
 * they survive process restarts (blueprint §39). Each job id is deterministic
 * (`outcome:<token>:<checkpoint>`) so re-scheduling is idempotent.
 */
export async function scheduleOutcomeCheckpoints(
  tokenAddress: string,
  detectionScanId: string | null,
  detectedAt: Date = new Date(),
): Promise<number> {
  const schedule = buildCheckpointSchedule(detectedAt);
  let scheduled = 0;
  for (const cp of schedule) {
    const ok = await enqueue(
      "outcomes",
      "outcome-checkpoint",
      { tokenAddress, checkpoint: cp.checkpoint, detectionScanId, dueAt: cp.dueAt.toISOString() },
      { jobId: `outcome:${tokenAddress}:${detectionScanId ?? "na"}:${cp.checkpoint}`, delayMs: cp.delayMs },
    );
    if (ok) scheduled++;
  }
  if (scheduled === 0) {
    logger.warn({ tokenAddress }, "outcome scheduling skipped (queues disabled)");
  }
  return scheduled;
}
