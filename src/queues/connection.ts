import IORedis, { type Redis } from "ioredis";
import { getConfig } from "../config";
import { logger } from "../utils/logger";

let connection: Redis | null = null;
let attempted = false;

/**
 * Lazily create a shared Redis connection for BullMQ. Returns null when no
 * REDIS_URL is configured so the app can still boot in a degraded mode
 * (queues disabled) — matching the "provider failure degrades, not crashes"
 * principle.
 */
export function getRedis(): Redis | null {
  if (attempted) return connection;
  attempted = true;
  const { env } = getConfig();
  if (!env.REDIS_URL) {
    logger.warn("REDIS_URL not set — queues/cache disabled (degraded mode).");
    return null;
  }
  connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  connection.on("error", (err) => logger.error({ err }, "Redis connection error"));
  connection.on("connect", () => logger.info("Redis connected"));
  return connection;
}

export async function pingRedis(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    const res = await r.ping();
    return res === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (connection) {
    await connection.quit().catch(() => void 0);
    connection = null;
    attempted = false;
  }
}
