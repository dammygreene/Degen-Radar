import { createBot } from "./bot";
import { getConfig } from "./config";
import { startServer } from "./app/server";
import { closeDb, pingDb } from "./db/client";
import { closeQueues } from "./queues";
import { closeRedis, pingRedis } from "./queues/connection";
import { startWorkers, stopWorkers } from "./queues/workers";
import { logger } from "./utils/logger";

/**
 * All-in-one entrypoint: starts the API, workers and Telegram bot in a single
 * process. For production, run `api`, `worker` and `bot` as separate services.
 */
async function main(): Promise<void> {
  const cfg = getConfig();
  logger.info({ env: cfg.env.NODE_ENV }, "Degen Radar starting…");

  const [db, redis] = await Promise.all([pingDb(), pingRedis()]);
  logger.info({ db, redis }, "dependency check");

  const app = await startServer();
  logger.info({ port: cfg.env.PORT }, "API listening");

  const workers = startWorkers();
  logger.info({ workers }, workers > 0 ? "workers started" : "workers disabled (no Redis)");

  const bot = createBot();
  if (bot) {
    bot.start({ onStart: (info) => logger.info({ username: info.username }, "bot online") });
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "graceful shutdown");
    await app.close().catch(() => void 0);
    if (bot) await bot.stop().catch(() => void 0);
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
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
