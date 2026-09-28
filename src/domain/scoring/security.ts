import type { TokenSecurityData } from "../types";
import { CATEGORY_MAX, type CategoryScore } from "../scans/types";
import { clamp, isNum, lerp, round1 } from "./util";

const MAX = CATEGORY_MAX.SECURITY;

/**
 * Security / Structure (25 pts). Starts from full marks and deducts for
 * concrete risk evidence. An active authority is a risk *flag*, not proof of
 * malice, so it is penalized but not treated as automatically fatal here.
 * Critical suppression is decided separately in qualification.
 */
export function scoreSecurity(security: TokenSecurityData | null): CategoryScore {
  if (!security || security.status === "unavailable") {
    return {
      category: "SECURITY",
      points: round1(MAX * 0.4),
      maxPoints: MAX,
      direction: "neutral",
      reason: "Security data unavailable; scored conservatively pending verification.",
      evidence: { status: security?.status ?? "unavailable" },
    };
  }

  let points = MAX;
  const negatives: string[] = [];
  const positives: string[] = [];

  if (security.mintAuthority) {
    points -= 5;
    negatives.push("mint authority active");
  } else {
    positives.push("mint authority renounced");
  }

  if (security.freezeAuthority) {
    points -= 5;
    negatives.push("freeze authority active");
  } else {
    positives.push("freeze authority renounced");
  }

  // Holder concentration (top10)
  if (isNum(security.top10Pct)) {
    if (security.top10Pct >= 60) {
      points -= 6;
      negatives.push(`top-10 hold ${Math.round(security.top10Pct)}%`);
    } else if (security.top10Pct >= 40) {
      points -= 3;
      negatives.push(`top-10 hold ${Math.round(security.top10Pct)}%`);
    } else if (security.top10Pct <= 25) {
      positives.push(`top-10 only ${Math.round(security.top10Pct)}%`);
    }
  }

  // Creator exposure
  if (isNum(security.creatorBalancePct) && security.creatorBalancePct >= 10) {
    points -= clamp(lerp(security.creatorBalancePct, 10, 30, 1, 5), 1, 5);
    negatives.push(`creator holds ${Math.round(security.creatorBalancePct)}%`);
  }

  // Creator dumping
  if (isNum(security.creatorRecentSellPct) && security.creatorRecentSellPct > 0) {
    points -= clamp(lerp(security.creatorRecentSellPct, 1, 10, 2, 6), 2, 6);
    negatives.push(`creator sold ${round1(security.creatorRecentSellPct)}% of supply`);
  }

  // Cluster / bundle
  if (isNum(security.suspiciousClusterScore) && security.suspiciousClusterScore >= 0.5) {
    points -= clamp(lerp(security.suspiciousClusterScore, 0.5, 1, 2, 6), 2, 6);
    negatives.push("coordinated-wallet cluster evidence");
  }
  if (security.bundledLaunch) {
    points -= 3;
    negatives.push("bundled launch indicators");
  }

  // Liquidity withdrawal
  if (isNum(security.liquidityChangePct) && security.liquidityChangePct <= -15) {
    points -= clamp(lerp(-security.liquidityChangePct, 15, 50, 2, 6), 2, 6);
    negatives.push(`liquidity fell ${Math.round(-security.liquidityChangePct)}%`);
  }

  // Explicit critical flags
  const criticalFlags = security.riskFlags.filter((f) => f.severity === "critical");
  if (criticalFlags.length > 0) {
    points -= 6 * criticalFlags.length;
    negatives.push(...criticalFlags.map((f) => f.message));
  }

  points = clamp(round1(points), 0, MAX);
  const direction = points >= MAX * 0.6 ? "positive" : points <= MAX * 0.4 ? "negative" : "neutral";
  const reason =
    negatives.length > 0
      ? `Risk factors: ${negatives.slice(0, 3).join("; ")}.`
      : `Clean structure: ${positives.slice(0, 3).join("; ") || "no major flags detected"}.`;

  return {
    category: "SECURITY",
    points,
    maxPoints: MAX,
    direction,
    reason,
    evidence: {
      mintAuthority: security.mintAuthority,
      freezeAuthority: security.freezeAuthority,
      top10Pct: security.top10Pct,
      creatorBalancePct: security.creatorBalancePct,
      criticalFlags: criticalFlags.map((f) => f.code),
    },
  };
}
