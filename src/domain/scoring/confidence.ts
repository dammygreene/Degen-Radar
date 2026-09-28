import { ageMs } from "../../utils/time";
import type { ScanBundle } from "../scans/types";
import { clamp } from "./util";

export interface ConfidencePenalty {
  code: string;
  points: number;
  reason: string;
}

export interface ConfidenceResult {
  confidence: number;
  penalties: ConfidencePenalty[];
}

const STALE_MARKET_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Confidence reflects *evidence completeness/quality*, not token quality.
 * Starts at 100 and deducts for missing / stale / uncertain inputs.
 */
export function calculateConfidence(bundle: ScanBundle, at: Date = new Date()): ConfidenceResult {
  const penalties: ConfidencePenalty[] = [];
  const add = (code: string, points: number, reason: string) =>
    penalties.push({ code, points, reason });

  // Critical: market data
  if (!bundle.market) {
    add("MARKET_MISSING", 15, "Market data provider unavailable");
  } else if (ageMs(bundle.market.observedAt, at) > STALE_MARKET_MS) {
    add("MARKET_STALE", 10, "Market data is stale (>5m old)");
  }

  // Security / structure
  if (!bundle.security || bundle.security.status === "unavailable") {
    add("SECURITY_MISSING", 12, "Security/structure data unavailable");
  } else if (bundle.security.status === "partial") {
    add("SECURITY_PARTIAL", 5, "Security data incomplete");
  }

  // Holders
  if (!bundle.holders || bundle.holders.status === "unavailable") {
    add("HOLDERS_MISSING", 10, "Holder data unavailable");
  } else if (bundle.holders.status === "partial") {
    add("HOLDERS_PARTIAL", 4, "Holder data incomplete");
  }

  // Momentum history
  if (!bundle.momentum || !bundle.momentum.hasSufficientHistory) {
    add("MOMENTUM_HISTORY", 6, "Insufficient snapshot history for momentum");
  }

  // Wallet identity certainty
  if (bundle.walletIntel && bundle.walletIntel.status === "partial") {
    add("WALLET_UNCERTAIN", 10, "Wallet identity resolution uncertain");
  }

  // X / narrative
  if (!bundle.social || bundle.social.status === "unavailable") {
    add("X_MISSING", 5, "X / narrative data unavailable");
  }

  // Any additional missing providers not covered above
  for (const src of bundle.missingSources) {
    if (!penalties.some((p) => p.code.toLowerCase().includes(src.toLowerCase()))) {
      add(`PROVIDER_${src.toUpperCase()}`, 3, `Provider "${src}" degraded`);
    }
  }

  const total = penalties.reduce((sum, p) => sum + p.points, 0);
  return { confidence: clamp(Math.round(100 - total), 0, 100), penalties };
}
