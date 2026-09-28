import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb } from "./client";
import { logger } from "../utils/logger";

/** Applies SQL migrations from ./drizzle. Run via `npm run db:migrate`. */
async function main(): Promise<void> {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }
  logger.info("Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  logger.info("Migrations complete.");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Migration failed");
  process.exit(1);
});
