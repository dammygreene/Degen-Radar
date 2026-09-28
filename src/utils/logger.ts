import pino, { type Logger } from "pino";

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug");

const usePretty = process.env.NODE_ENV !== "production" && process.env.LOG_PRETTY !== "false";

export const logger: Logger = pino({
  level,
  base: { service: "degen-radar" },
  redact: {
    paths: [
      "*.token",
      "*.apiKey",
      "*.api_key",
      "*.bearer",
      "*.authorization",
      "TELEGRAM_BOT_TOKEN",
      "FOMO_API_KEY",
      "X_BEARER_TOKEN",
      "BIRDEYE_API_KEY",
      "DATABASE_URL",
    ],
    censor: "[REDACTED]",
  },
  transport: usePretty
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname,service" },
      }
    : undefined,
});

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
