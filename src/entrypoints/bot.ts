import { createBot } from "../bot";
import { closeDb } from "../db/client";
import { closeRedis } from "../queues/connection";
import { logger } from "../utils/logger";

async function main(): Promise<void> {
  const bot = createBot();
  if (!bot) {
    logger.error("Cannot start bot: TELEGRAM_BOT_TOKEN not configured.");
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down bot");
    await bot.stop();
    await closeDb();
    await closeRedis();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.info("Starting Telegram bot (long polling)…");
  await bot.start({ onStart: (info) => logger.info({ username: info.username }, "bot online") });
}

main().catch((err) => {
  logger.error({ err }, "Bot failed to start");
  process.exit(1);
});
