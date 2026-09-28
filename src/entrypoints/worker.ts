import { closeDb } from "../db/client";
import { closeQueues } from "../queues";
import { closeRedis } from "../queues/connection";
import { startWorkers, stopWorkers } from "../queues/workers";
import { logger } from "../utils/logger";

async function main(): Promise<void> {
  const started = startWorkers();
  if (started === 0) {
    logger.error("No workers started — REDIS_URL is required for the worker process.");
    process.exit(1);
  }
  logger.info({ workers: started }, "Radar workers running");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down workers");
    await stopWorkers();
    await closeQueues();
    await closeDb();
    await closeRedis();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});
