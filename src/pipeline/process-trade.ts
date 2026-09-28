import type { ConvergenceEntry, ConvergenceResult } from "../domain/convergence";
import { analyzeConvergence } from "../domain/convergence";
import { qualifiesForAlert } from "../domain/alerts/qualify";
import type { AlertType } from "../domain/alerts/types";
import { resolveScanPriority, type ScanPriority } from "../domain/scans/priority";
import type { ScanResult } from "../domain/scans/types";
import type { NormalizedTrade } from "../domain/types";
import type { UserSettings } from "../domain/users/types";
import { defaultUserSettings } from "../domain/users/types";
import type { EventInbox } from "../services/event-inbox/types";
import type { ResolvedTradeEntity } from "../services/wallet-monitor/ingest";
import { logger } from "../utils/logger";

export interface AlertDecision {
  send: boolean;
  alertType: AlertType;
  reasons: string[];
  scan: ScanResult;
  convergence: ConvergenceResult | null;
  priority: ScanPriority;
}

export interface ProcessTradeDeps {
  inbox: EventInbox;
  /** Resolve wallet -> watched entity (null when unwatched). */
  resolveEntity: (wallet: string) => Promise<ResolvedTradeEntity | null>;
  /** Persist an entry and return recent entries in the convergence window. */
  recordEntry: (entry: ConvergenceEntry, tokenAddress: string) => Promise<ConvergenceEntry[]>;
  /** Run (coalesced) token scan and return the result. */
  runScan: (
    tokenAddress: string,
    input: { priority: ScanPriority; convergenceEntries: ConvergenceEntry[] },
  ) => Promise<ScanResult>;
  /** Cooldown/anti-spam gate; return false to suppress delivery. */
  allowDelivery: (tokenAddress: string, alertType: AlertType) => Promise<boolean>;
  /** Deliver the (single) alert. */
  deliverAlert: (decision: AlertDecision, trade: NormalizedTrade) => Promise<void>;
  /** Schedule durable outcome checkpoints after a qualifying detection. */
  scheduleOutcomes: (tokenAddress: string, scan: ScanResult) => Promise<void>;
  settings?: UserSettings;
  convergenceWindowSeconds?: number;
  convergenceMinEntities?: number;
}

export interface ProcessTradeResult {
  status: "duplicate" | "unwatched" | "ignored_side" | "backfilled" | "processed";
  alertSent: boolean;
  convergence: ConvergenceResult | null;
  scan: ScanResult | null;
}

/**
 * End-to-end processing for one normalized trade (from Helius or FOMO):
 *
 *   durable inbox dedup → watched-entity resolution → convergence context →
 *   coalesced token scan → qualification → ONE alert → outcome scheduling.
 *
 * Backfill trades update wallet/token context but never auto-alert. Convergence
 * produces a single aggregated alert rather than one alert per entry. (§10–19)
 */
export async function processTradeEvent(
  trade: NormalizedTrade,
  deps: ProcessTradeDeps,
  now: Date = new Date(),
): Promise<ProcessTradeResult> {
  const settings = deps.settings ?? defaultUserSettings();
  const windowSeconds = deps.convergenceWindowSeconds ?? settings.convergenceWindowSeconds;
  const minEntities = deps.convergenceMinEntities ?? settings.convergenceMinEntities;

  // 1. Durable dedup: the inbox unique constraint is authoritative.
  const enq = await deps.inbox.enqueue({
    eventType: trade.side === "BUY" ? "wallet.buy.detected" : "wallet.sell.detected",
    provider: trade.source,
    providerEventId: trade.providerEventId,
    idempotencyKey: trade.idempotencyKey,
    occurredAt: trade.occurredAt,
    payload: trade,
  });
  if (!enq.inserted) {
    return { status: "duplicate", alertSent: false, convergence: null, scan: null };
  }
  const inboxId = enq.event!.id;

  try {
    // Only BUYs from watched entities drive scans/alerts.
    if (trade.side !== "BUY") {
      await deps.inbox.markProcessed(inboxId);
      return { status: "ignored_side", alertSent: false, convergence: null, scan: null };
    }

    const entity = await deps.resolveEntity(trade.wallet);
    if (!entity) {
      await deps.inbox.markProcessed(inboxId);
      return { status: "unwatched", alertSent: false, convergence: null, scan: null };
    }

    const entry: ConvergenceEntry = {
      entityId: entity.entityId,
      entityType: entity.entityType,
      wallet: entity.wallet,
      clusterId: entity.clusterId,
      enteredAt: trade.occurredAt,
      amountUsd: trade.amountUsd,
    };
    const recent = await deps.recordEntry(entry, trade.tokenAddress);
    const convergence = analyzeConvergence(recent, { windowSeconds, minEntities, now });

    // Backfill: establish context only, never auto-alert.
    if (trade.backfill) {
      await deps.inbox.markProcessed(inboxId);
      return { status: "backfilled", alertSent: false, convergence, scan: null };
    }

    const isConvergence = convergence.isConvergence;
    const alertType: AlertType = isConvergence
      ? "CONVERGENCE"
      : entity.entityType === "fomo"
        ? "FOMO_SIGNAL"
        : "WATCHED_WALLET_SIGNAL";

    const priority = resolveScanPriority({
      reason: isConvergence ? "CONVERGENCE" : entity.entityType === "fomo" ? "FOMO_BUY" : "WATCHED_WALLET_BUY",
      independentEntities: convergence.clusterAdjustedCount,
    });

    // Coalesced scan (reuses a fresh scan / dedupes concurrent buys).
    const scan = await deps.runScan(trade.tokenAddress, { priority, convergenceEntries: recent });

    const qualification = qualifiesForAlert(
      scan,
      {
        alertType,
        independentEntities: convergence.clusterAdjustedCount,
        marketCapUsd: undefined,
        liquidityUsd: undefined,
      },
      settings,
    );

    const decision: AlertDecision = {
      send: qualification.qualifies,
      alertType,
      reasons: qualification.reasons,
      scan,
      convergence: isConvergence ? convergence : null,
      priority,
    };

    let alertSent = false;
    if (decision.send) {
      const allowed = await deps.allowDelivery(trade.tokenAddress, alertType);
      if (allowed) {
        await deps.deliverAlert(decision, trade);
        await deps.scheduleOutcomes(trade.tokenAddress, scan);
        alertSent = true;
      } else {
        logger.debug({ token: trade.tokenAddress, alertType }, "alert suppressed by cooldown");
      }
    }

    await deps.inbox.markProcessed(inboxId);
    return { status: "processed", alertSent, convergence, scan };
  } catch (err) {
    await deps.inbox.markFailed(inboxId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
