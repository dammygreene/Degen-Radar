import type { SocialSnapshot, TokenIdentity, XPost } from "../../domain/types";

/**
 * Aggregate raw X posts into a normalized SocialSnapshot. Narrative summaries
 * are grounded strictly in retrieved posts (source IDs are stored); no facts
 * are fabricated. If there are no posts, status reflects that honestly.
 */
export function aggregateSocial(
  token: TokenIdentity,
  posts: readonly XPost[],
  opts: { available: boolean; now?: Date; source?: string } = { available: true },
): SocialSnapshot {
  const now = opts.now ?? new Date();
  const source = opts.source ?? "x";

  if (!opts.available) {
    return emptySnapshot(token, now, source, "unavailable");
  }

  const ageMin = (p: XPost) => (now.getTime() - p.createdAt.getTime()) / 60000;
  const within = (min: number) => posts.filter((p) => ageMin(p) <= min);

  const p15 = within(15);
  const p60 = within(60);
  const p360 = within(360);
  const p1440 = within(1440);

  const authors = new Map<string, number>();
  let likes = 0;
  let replies = 0;
  let quotes = 0;
  for (const p of p1440) {
    authors.set(p.authorId, (authors.get(p.authorId) ?? 0) + 1);
    likes += p.likes;
    replies += p.replies;
    quotes += p.quotes;
  }

  const uniqueAuthors = authors.size;
  const totalAuthored = [...authors.values()].reduce((a, b) => a + b, 0);
  const repeatAuthored = [...authors.values()].filter((c) => c > 1).reduce((a, b) => a + b, 0);
  const repeatAuthorPct = totalAuthored > 0 ? (repeatAuthored / totalAuthored) * 100 : 0;

  const narrativeSummary =
    p1440.length > 0
      ? summarize(token, p1440)
      : null;

  return {
    token,
    mentions15m: p15.length,
    mentions1h: p60.length,
    mentions6h: p360.length,
    mentions24h: p1440.length,
    uniqueAuthors,
    likes,
    replies,
    quotes,
    repeatAuthorPct: Math.round(repeatAuthorPct),
    narrativeSummary,
    sourcePostIds: p1440.slice(0, 25).map((p) => p.id),
    observedAt: now,
    source,
    status: p1440.length === 0 ? "partial" : "ok",
  };
}

function emptySnapshot(
  token: TokenIdentity,
  now: Date,
  source: string,
  status: SocialSnapshot["status"],
): SocialSnapshot {
  return {
    token,
    mentions15m: 0,
    mentions1h: 0,
    mentions6h: 0,
    mentions24h: 0,
    uniqueAuthors: 0,
    likes: 0,
    replies: 0,
    quotes: 0,
    repeatAuthorPct: 0,
    narrativeSummary: null,
    sourcePostIds: [],
    observedAt: now,
    source,
    status,
  };
}

/** Evidence-grounded, non-fabricated one-liner. */
function summarize(token: TokenIdentity, posts: readonly XPost[]): string {
  const label = token.symbol ? `$${token.symbol}` : token.address.slice(0, 6);
  const authors = new Set(posts.map((p) => p.authorId)).size;
  return `${posts.length} recent posts from ${authors} authors mention ${label}.`;
}
