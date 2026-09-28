import { Bot } from "grammy";
import { getConfig } from "../config";
import { logger } from "../utils/logger";

let alertBot: Bot | null = null;
let initialized = false;

/**
 * A shared Bot instance used to SEND alerts from any process (e.g. the worker)
 * without starting long-polling. Returns null when no token is configured.
 */
export async function getAlertBot(): Promise<Bot | null> {
  const token = getConfig().env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (!alertBot) alertBot = new Bot(token);
  if (!initialized) {
    try {
      await alertBot.init();
      initialized = true;
    } catch (err) {
      logger.error({ err }, "alert bot init failed");
      return null;
    }
  }
  return alertBot;
}

export async function sendMessageSafe(chatId: number, text: string): Promise<boolean> {
  const bot = await getAlertBot();
  if (!bot) return false;
  try {
    await bot.api.sendMessage(chatId, text);
    return true;
  } catch (err) {
    logger.warn({ err, chatId }, "sendMessage failed");
    return false;
  }
}
