import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getConfig } from "../config";
import { logger } from "../utils/logger";
import { schema } from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

let sqlClient: ReturnType<typeof postgres> | null = null;
let db: Database | null = null;
let attempted = false;

/**
 * Lazily create the Drizzle DB. Returns null when DATABASE_URL is not set so
 * the API can still boot in degraded mode and report DB as down via /health.
 */
export function getDb(): Database | null {
  if (attempted) return db;
  attempted = true;
  const { env } = getConfig();
  if (!env.DATABASE_URL) {
    logger.warn("DATABASE_URL not set — persistence disabled (degraded mode).");
    return null;
  }
  sqlClient = postgres(env.DATABASE_URL, { max: 10, onnotice: () => void 0 });
  db = drizzle(sqlClient, { schema });
  return db;
}

export function getSqlClient(): ReturnType<typeof postgres> | null {
  getDb();
  return sqlClient;
}

export async function pingDb(): Promise<boolean> {
  const client = getSqlClient();
  if (!client) return false;
  try {
    await client`select 1`;
    return true;
  } catch (err) {
    logger.error({ err }, "DB ping failed");
    return false;
  }
}

export async function closeDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 }).catch(() => void 0);
    sqlClient = null;
    db = null;
    attempted = false;
  }
}
