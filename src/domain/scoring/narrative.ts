import type { SocialSnapshot } from "../types";
import { CATEGORY_MAX, type CategoryScore } from "../scans/types";
import { clamp, isNum, lerp, ratio, round1 } from "./util";

const MAX = CATEGORY_MAX.NARRATIVE;

/**
 * X / Narrative (5 pts). Rewards organic discussion — unique authors, mention
 * acceleration and engagement — while penalizing spam concentration. Raw
 * mention count alone is never scored.
 */
export function scoreNarrative(social: SocialSnapshot | null): CategoryScore {
  if (!social || social.status === "unavailable") {
    return {
      category: "NARRATIVE",
      points: 0,
      maxPoints: MAX,
      direction: "neutral",
      reason: "X / narrative data unavailable (does not reduce token quality, only evidence).",
      evidence: { status: social?.status ?? "unavailable" },
    };
  }

  const reasons: string[] = [];

  // Unique authors (up to 2)
  const authorPts = lerp(social.uniqueAuthors, 2, 40, 0, 2);
  reasons.push(`${social.uniqueAuthors} unique authors`);

  // Mention acceleration: 15m rate vs 1h average (up to 2)
  const rate15m = social.mentions15m;
  const hourlyAvg15m = ratio(social.mentions1h, 4); // per 15m
  let accelPts = 0;
  if (isNum(hourlyAvg15m) && hourlyAvg15m > 0) {
    const accel = rate15m / hourlyAvg15m;
    accelPts = lerp(accel, 1, 3, 0, 2);
    if (accel > 1.2) reasons.push(`mentions accelerating ${Math.round(accel * 100)}% of trend`);
  }

  // Engagement (up to 1)
  const engagement = social.likes + social.replies + social.quotes;
  const engPts = lerp(engagement, 0, 500, 0, 1);

  // Spam penalty: high repeat-author concentration
  let spamPenalty = 0;
  if (social.repeatAuthorPct >= 50) {
    spamPenalty = lerp(social.repeatAuthorPct, 50, 90, 0.5, 2);
    reasons.push(`${Math.round(social.repeatAuthorPct)}% repeat-author (spam risk)`);
  }

  const points = clamp(round1(authorPts + accelPts + engPts - spamPenalty), 0, MAX);
  const direction = points >= MAX * 0.6 ? "positive" : points <= MAX * 0.2 ? "negative" : "neutral";

  return {
    category: "NARRATIVE",
    points,
    maxPoints: MAX,
    direction,
    reason: `Narrative: ${reasons.slice(0, 3).join("; ")}.`,
    evidence: {
      uniqueAuthors: social.uniqueAuthors,
      mentions15m: social.mentions15m,
      mentions1h: social.mentions1h,
      repeatAuthorPct: social.repeatAuthorPct,
      engagement,
    },
  };
}
