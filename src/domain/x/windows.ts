import type { XPost } from "../types";

export type AccelerationState =
  | "INSUFFICIENT_HISTORY"
  | "NO_PRIOR_ACTIVITY"
  | "ACCELERATING"
  | "STABLE"
  | "DECELERATING";

export interface WindowStats {
  windowMinutes: number;
  mentions: number;
  uniqueAuthors: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  engagement: number;
  repeatAuthorPct: number;
}

export interface AccelerationResult {
  ratio: number | null;
  state: AccelerationState;
}

/** Compute engagement/author stats for posts within `windowMinutes` of `now`. */
export function windowStats(posts: readonly XPost[], windowMinutes: number, now: Date): WindowStats {
  const cutoff = now.getTime() - windowMinutes * 60_000;
  const inWindow = posts.filter((p) => p.createdAt.getTime() >= cutoff);

  const authors = new Map<string, number>();
  let likes = 0;
  let replies = 0;
  let reposts = 0;
  let quotes = 0;
  for (const p of inWindow) {
    authors.set(p.authorId, (authors.get(p.authorId) ?? 0) + 1);
    likes += p.likes;
    replies += p.replies;
    reposts += p.reposts;
    quotes += p.quotes;
  }
  const total = [...authors.values()].reduce((a, b) => a + b, 0);
  const repeat = [...authors.values()].filter((c) => c > 1).reduce((a, b) => a + b, 0);

  return {
    windowMinutes,
    mentions: inWindow.length,
    uniqueAuthors: authors.size,
    likes,
    replies,
    reposts,
    quotes,
    engagement: likes + replies + reposts + quotes,
    repeatAuthorPct: total > 0 ? Math.round((repeat / total) * 100) : 0,
  };
}

/**
 * Acceleration = current-window rate vs. the immediately preceding equivalent
 * window. Zero baselines are handled explicitly — never returns Infinity.
 * (blueprint §24)
 */
export function computeAcceleration(
  posts: readonly XPost[],
  windowMinutes: number,
  now: Date,
): AccelerationResult {
  const current = countInRange(posts, now.getTime() - windowMinutes * 60_000, now.getTime());
  const prior = countInRange(
    posts,
    now.getTime() - 2 * windowMinutes * 60_000,
    now.getTime() - windowMinutes * 60_000,
  );

  // Need enough total signal to judge acceleration meaningfully.
  if (current + prior < 3) return { ratio: null, state: "INSUFFICIENT_HISTORY" };
  if (prior === 0) return { ratio: null, state: "NO_PRIOR_ACTIVITY" };

  const ratio = current / prior;
  let state: AccelerationState;
  if (ratio >= 1.25) state = "ACCELERATING";
  else if (ratio <= 0.75) state = "DECELERATING";
  else state = "STABLE";

  return { ratio, state };
}

function countInRange(posts: readonly XPost[], fromMs: number, toMs: number): number {
  return posts.filter((p) => {
    const t = p.createdAt.getTime();
    return t >= fromMs && t < toMs;
  }).length;
}
