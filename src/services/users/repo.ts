import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { users } from "../../db/schema";
import { defaultUserSettings, type UserSettings } from "../../domain/users/types";

export interface UserRecord {
  id: string;
  telegramUserId: number;
  username: string | null;
  settings: UserSettings;
}

function toSettings(row: typeof users.$inferSelect): UserSettings {
  const stored = (row.settings ?? {}) as Partial<UserSettings>;
  return defaultUserSettings({
    ...stored,
    minScore: row.minAlertScore,
    minConfidence: row.minConfidence,
    alertEnabled: row.alertEnabled,
  });
}

/** Upsert a Telegram user, returning the domain record. Requires a DB. */
export async function upsertUser(
  telegramUserId: number,
  username: string | null,
): Promise<UserRecord> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");

  const existing = await db.query.users.findFirst({
    where: eq(users.telegramUserId, telegramUserId),
  });
  if (existing) {
    if (username && username !== existing.username) {
      await db.update(users).set({ username, updatedAt: new Date() }).where(eq(users.id, existing.id));
    }
    return { id: existing.id, telegramUserId, username: username ?? existing.username, settings: toSettings(existing) };
  }

  const [created] = await db
    .insert(users)
    .values({ telegramUserId, username })
    .returning();
  return {
    id: created!.id,
    telegramUserId,
    username,
    settings: toSettings(created!),
  };
}

export async function getUserByTelegramId(telegramUserId: number): Promise<UserRecord | null> {
  const db = getDb();
  if (!db) return null;
  const row = await db.query.users.findFirst({ where: eq(users.telegramUserId, telegramUserId) });
  if (!row) return null;
  return { id: row.id, telegramUserId, username: row.username, settings: toSettings(row) };
}

export async function updateUserSettings(
  userId: string,
  patch: Partial<UserSettings>,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!row) throw new Error("User not found");
  const next = defaultUserSettings({ ...(row.settings as Partial<UserSettings>), ...patch });
  await db
    .update(users)
    .set({
      settings: next,
      minAlertScore: next.minScore,
      minConfidence: next.minConfidence,
      alertEnabled: next.alertEnabled,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
