import { formatUsd } from "../../utils/format";
import { formatAge } from "../../utils/time";
import type { ScanResult } from "../scans/types";
import type { ConvergenceResult } from "../convergence";

function dot(direction: string): string {
  return direction === "negative" ? "🔴" : direction === "positive" ? "🟢" : "⚪";
}

function tokenTitle(scan: ScanResult): string {
  const s = scan.token.symbol ? `$${scan.token.symbol}` : scan.token.address.slice(0, 8);
  return s;
}

export interface MarketFacts {
  marketCapUsd?: number | null;
  liquidityUsd?: number | null;
  ageMs?: number | null;
}

/** 🚨 RADAR SIGNAL — a qualifying single-wallet / FOMO alert. */
export function renderRadarSignal(
  scan: ScanResult,
  facts: MarketFacts,
  watched?: { label: string; entryMcUsd?: number | null; sizeUsd?: number | null },
): string {
  const lines: string[] = [];
  lines.push("🚨 RADAR SIGNAL", "", tokenTitle(scan), "");
  lines.push(`MC         ${formatUsd(facts.marketCapUsd)}`);
  lines.push(`Liquidity  ${formatUsd(facts.liquidityUsd)}`);
  if (facts.ageMs != null) lines.push(`Age        ${formatAge(facts.ageMs)}`);
  lines.push("");
  lines.push(`RADAR      ${scan.score}/100`);
  lines.push(`Confidence ${scan.confidence}%`);
  lines.push(`Data age   ${formatAge(scan.dataAgeMs)}`);
  lines.push("", "WHY", "");
  for (const c of scan.positives.slice(0, 6)) {
    lines.push(`${dot(c.direction)} ${c.reason}`);
  }
  if (scan.risks.length > 0) {
    lines.push("", "RISKS", "");
    for (const c of scan.risks.slice(0, 3)) {
      lines.push(`${dot(c.direction)} ${c.reason}`);
    }
  }
  if (watched) {
    lines.push("", "WATCHED ACTIVITY", "", watched.label);
    if (watched.entryMcUsd != null) lines.push(`Entry MC   ${formatUsd(watched.entryMcUsd)}`);
    if (watched.sizeUsd != null) lines.push(`Size       ~${formatUsd(watched.sizeUsd)}`);
  }
  return lines.join("\n");
}

/** 🔥 WALLET CONVERGENCE alert. */
export function renderConvergence(
  scan: ScanResult,
  convergence: ConvergenceResult,
  _facts: MarketFacts,
): string {
  const minutes = Math.max(
    1,
    Math.round(
      convergence.firstEntryAt && convergence.lastEntryAt
        ? (convergence.lastEntryAt.getTime() - convergence.firstEntryAt.getTime()) / 60000
        : convergence.windowSeconds / 60,
    ),
  );
  const independentWallets = convergence.clusterAdjustedCount - convergence.fomoCount;
  const lines: string[] = [];
  lines.push("🔥 WALLET CONVERGENCE", "", tokenTitle(scan), "");
  lines.push(`${convergence.clusterAdjustedCount} independent entities entered`);
  lines.push(`within ${minutes} minute${minutes === 1 ? "" : "s"}.`, "");
  lines.push(`${Math.max(0, independentWallets)} independent wallets`);
  lines.push(`${convergence.fomoCount} FOMO account${convergence.fomoCount === 1 ? "" : "s"}`);
  lines.push(`(${convergence.uniqueWalletCount} unique wallets, ${convergence.entityCount} raw entries)`);
  lines.push("");
  lines.push(`RADAR      ${scan.score}/100`);
  lines.push(`Confidence ${scan.confidence}%`);
  lines.push("");
  for (const c of scan.positives.slice(0, 4)) {
    lines.push(`${dot(c.direction)} ${c.reason}`);
  }
  return lines.join("\n");
}

/** ⚠️ RISK CHANGE alert. */
export function renderRiskChange(
  scan: ScanResult,
  previousScore: number,
  changeReasons: string[],
): string {
  const lines: string[] = [];
  lines.push("⚠️ RISK CHANGE", "", tokenTitle(scan), "");
  for (const r of changeReasons.slice(0, 4)) lines.push(r);
  lines.push("", `Radar ${previousScore} → ${scan.score}`);
  return lines.join("\n");
}

/** Compact candidate line for /scan lists. */
export function renderCandidate(scan: ScanResult, facts: MarketFacts): string {
  const lines: string[] = [];
  lines.push(tokenTitle(scan));
  lines.push(`MC ${formatUsd(facts.marketCapUsd)}  Liq ${formatUsd(facts.liquidityUsd)}`);
  lines.push(`Radar ${scan.score}  Confidence ${scan.confidence}%`);
  for (const c of scan.positives.slice(0, 3)) lines.push(`${dot(c.direction)} ${c.reason}`);
  return lines.join("\n");
}
