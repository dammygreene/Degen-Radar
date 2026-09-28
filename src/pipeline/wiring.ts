import { and, desc, eq, gte } from "drizzle-orm";
import { getConfig } from "../config";
import { getDb } from "../db/client";
import { alerts as alertsTable, tokens, users, watchedEntities } from "../db/schema";
import { evaluateCooldown, type AlertRecord } from "../domain/alerts/cooldown";
import { renderConvergence, renderRadarSignal } from "../domain/alerts/templates";
import type { AlertType } from "../domain/alerts/types";
import { defaultUserSettings } from "../domain/users/types";
import { HOUR } from "../utils/time";
import { logger } from "../utils/logger";
import { getEventInbox } from "../services/event-inbox";
import { ScanCoalescer } from "../services/scan-orchestrator/coalesce";
import { persistScan } from "../services/scan-orchestrator/persist";
import { scanToken } from "../services/scan-orchestrator";
import { scheduleOutcomeCheckpoints } from "../services/outcome-tracker/schedule";
import { recordAndLoadEntries, resolveWatchedEntity } from "../services/wallet-monitor/entity-repo";
import { sendMessageSafe } from "../bot/shared";
import type { AlertDecision, ProcessTradeDeps } from "./process-trade";
import type { NormalizedTrade } from "../domain/types";

const coalescer = new ScanCoalescer(15_000);

/** Build production ProcessTradeDeps wired to DB, providers, queues and bot. */
export function buildProcessTradeDeps(): ProcessTradeDeps {
  const cfg = getConfig();
  const windowSeconds = cfg.alerts.convergenceWindowSeconds;

  return {
    inbox: getEventInbox(),
    resolveEntity: (wallet) => resolveWatchedEntity(wallet),
    recordEntry: (entry, tokenAddress) => recordAndLoadEntries(entry, tokenAddress, windowSeconds),

    runScan: async (tokenAddress, { priority, convergenceEntries }) => {
      const full = await coalescer.run(tokenAddress, async () => {
        const scan = await scanToken(tokenAddress, {
          reason: priority === "CRITICAL" || priority === "HIGH" ? "CONVERGENCE" : "MANUAL",
          convergenceEntries,
        });
        await persistScan(scan, { triggerType: "WATCHED_WALLET_BUY" });
        return scan;
      });
      return full.result;
    },

    allowDelivery: async (tokenAddress, _alertType) => {
      // Global per-token cooldown as a first gate; per-user cooldown is applied
      // during fan-out in deliverAlert.
      return globalTokenCooldown(tokenAddress, cfg.alerts.tokenCooldownSeconds);
    },

    deliverAlert: (decision, trade) => fanOutAlert(decision, trade),

    scheduleOutcomes: async (tokenAddress) => {
      await scheduleOutcomeCheckpoints(tokenAddress, null, new Date());
    },

    convergenceWindowSeconds: windowSeconds,
    convergenceMinEntities: cfg.alerts.convergenceMinEntities,
  };
}

const lastTokenAlert = new Map<string, number>();
function globalTokenCooldown(tokenAddress: string, cooldownSeconds: number): boolean {
  const now = Date.now();
  const last = lastTokenAlert.get(tokenAddress);
  if (last && now - last < cooldownSeconds * 1000) return false;
  lastTokenAlert.set(tokenAddress, now);
  return true;
}

/**
 * Fan a qualifying alert out to every user watching the triggering wallet,
 * honoring each user's settings + cooldown, then persist the alert row.
 */
async function fanOutAlert(decision: AlertDecision, trade: NormalizedTrade): Promise<void> {
  const db = getDb();
  const text =
    decision.convergence != null
      ? renderConvergence(decision.scan, decision.convergence, {})
      : renderRadarSignal(decision.scan, {}, {
          label: `wallet ${trade.wallet.slice(0, 4)}…`,
          sizeUsd: trade.amountUsd,
        });

  if (!db) {
    logger.info({ token: trade.tokenAddress, alertType: decision.alertType }, "alert (no DB, log only)");
    return;
  }

  // Users watching this wallet.
  const watchers = await db
    .select({ userId: watchedEntities.userId, telegramUserId: users.telegramUserId })
    .from(watchedEntities)
    .innerJoin(users, eq(users.id, watchedEntities.userId))
    .where(and(eq(watchedEntities.walletAddress, trade.wallet), eq(watchedEntities.enabled, true)));

  const tokenRow = await db.query.tokens.findFirst({ where: eq(tokens.address, trade.tokenAddress) });

  const tokenKey = tokenRow?.id ?? trade.tokenAddress;
  for (const w of watchers) {
    const recent = await loadRecentAlerts(w.userId);
    const cd = evaluateCooldown(
      recent,
      { userId: w.userId, tokenAddress: tokenKey },
      {
        tokenCooldownSeconds: getConfig().alerts.tokenCooldownSeconds,
        maxAlertsPerHour: getConfig().alerts.maxAlertsPerHour,
      },
    );
    const sent = cd.allowed ? await sendMessageSafe(Number(w.telegramUserId), text) : false;

    if (tokenRow) {
      await db.insert(alertsTable).values({
        userId: w.userId,
        tokenId: tokenRow.id,
        alertType: decision.alertType as AlertType,
        score: decision.scan.score,
        confidence: decision.scan.confidence,
        payload: { reasons: decision.reasons } as object,
        sentAt: sent ? new Date() : null,
        suppressed: !sent,
        suppressionReason: sent ? null : cd.reason ?? "delivery_failed",
      });
    }
  }
}

async function loadRecentAlerts(userId: string): Promise<AlertRecord[]> {
  const db = getDb();
  if (!db) return [];
  const since = new Date(Date.now() - HOUR);
  const rows = await db
    .select({ tokenId: alertsTable.tokenId, sentAt: alertsTable.sentAt, createdAt: alertsTable.createdAt })
    .from(alertsTable)
    .where(and(eq(alertsTable.userId, userId), gte(alertsTable.createdAt, since)))
    .orderBy(desc(alertsTable.createdAt))
    .limit(50);
  return rows
    .filter((r) => r.sentAt)
    .map((r) => ({ userId, tokenAddress: r.tokenId, sentAt: r.sentAt! }));
}

// Note: the default global settings used by the pure pipeline; per-user
// settings are applied during fan-out. Exposed for tests / callers.
export const pipelineDefaultSettings = defaultUserSettings();
