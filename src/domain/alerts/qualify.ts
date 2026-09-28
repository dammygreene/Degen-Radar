import type { UserSettings } from "../users/types";
import type { ScanResult } from "../scans/types";
import { isNum } from "../scoring/util";
import type { QualificationContext, QualificationResult } from "./types";

/**
 * Deterministic alert qualification. Never hardcodes "BUY". A qualifying alert
 * is a research-priority signal, gated by user-configurable thresholds.
 */
export function qualifiesForAlert(
  scan: ScanResult,
  context: QualificationContext,
  settings: UserSettings,
): QualificationResult {
  const reasons: string[] = [];
  let qualifies = true;

  if (!settings.alertEnabled) {
    return { qualifies: false, reasons: ["alerts disabled for user"] };
  }

  if (scan.criticalRisk) {
    qualifies = false;
    reasons.push("critical security risk flag present");
  }

  if (scan.score < settings.minScore) {
    qualifies = false;
    reasons.push(`score ${scan.score} < min ${settings.minScore}`);
  }

  if (scan.confidence < settings.minConfidence) {
    qualifies = false;
    reasons.push(`confidence ${scan.confidence} < min ${settings.minConfidence}`);
  }

  const liq = context.liquidityUsd;
  if (isNum(liq) && liq < settings.minLiquidityUsd) {
    qualifies = false;
    reasons.push(`liquidity ${Math.round(liq)} < min ${settings.minLiquidityUsd}`);
  }

  const mc = context.marketCapUsd;
  if (isNum(mc)) {
    if (mc < settings.minMarketCapUsd) {
      qualifies = false;
      reasons.push(`market cap ${Math.round(mc)} below universe floor`);
    } else if (mc > settings.maxMarketCapUsd) {
      qualifies = false;
      reasons.push(`market cap ${Math.round(mc)} above universe ceiling`);
    }
  }

  if (context.alertType === "CONVERGENCE") {
    const entities = context.independentEntities ?? 0;
    if (entities < settings.convergenceMinEntities) {
      qualifies = false;
      reasons.push(`only ${entities} independent entities (< ${settings.convergenceMinEntities})`);
    } else {
      reasons.push(
        entities >= 3
          ? `strong convergence: ${entities} independent entities`
          : `convergence: ${entities} independent entities`,
      );
    }
  }

  if (qualifies && reasons.length === 0) {
    reasons.push(`score ${scan.score} / confidence ${scan.confidence} passed thresholds`);
  }

  return { qualifies, reasons };
}
