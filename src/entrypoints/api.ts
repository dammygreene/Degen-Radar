import { getConfig } from "../config";
import { startServer } from "../app/server";
import { closeDb } from "../db/client";
import { closeRedis } from "../queues/connection";
import { logger } from "../utils/logger";

async function main(): Promise<void> {
  const cfg = getConfig();
  const app = await startServer();
  logger.info({ port: cfg.env.PORT, host: cfg.env.HOST }, "Radar API listening");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down API");
    await app.close().catch(() => void 0);
    await closeDb();
    await closeRedis();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "API failed to start");
  process.exit(1);
});
