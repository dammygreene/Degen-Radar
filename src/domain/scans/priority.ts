import type { ScanReason } from "./types";

export type ScanPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

/** Numeric BullMQ priority (lower number = higher priority in BullMQ). */
export const PRIORITY_WEIGHT: Record<ScanPriority, number> = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
};

export interface PriorityContext {
  reason: ScanReason;
  /** Independent (cluster-adjusted) entities involved, if convergence. */
  independentEntities?: number;
  riskChange?: boolean;
  backfill?: boolean;
}

/**
 * Map a scan trigger to an internal priority. Affects queue ordering and scan
 * freshness only — never trading. (blueprint §58)
 */
export function resolveScanPriority(ctx: PriorityContext): ScanPriority {
  if (ctx.backfill) return "LOW";
  if (ctx.riskChange) return "HIGH";

  switch (ctx.reason) {
    case "CONVERGENCE": {
      const n = ctx.independentEntities ?? 2;
      return n >= 3 ? "CRITICAL" : "HIGH";
    }
    case "WATCHED_WALLET_BUY":
    case "FOMO_BUY":
      return "HIGH";
    case "MANUAL":
    case "MOMENTUM":
      return "NORMAL";
    case "DISCOVERY":
      return "LOW";
    default:
      return "NORMAL";
  }
}
