import { describe, expect, it } from "vitest";
import { aggregateSocial } from "../src/services/x-intelligence/aggregate";
import type { TokenIdentity, XPost } from "../src/domain/types";

const token: TokenIdentity = { chain: "solana", address: "TOK", symbol: "ABC", name: null, decimals: 6 };
const now = new Date("2026-01-01T12:00:00Z");
const minAgo = (m: number) => new Date(now.getTime() - m * 60_000);

function post(over: Partial<XPost>): XPost {
  return {
    id: Math.random().toString(36),
    authorId: "a1",
    authorHandle: "a1",
    text: "gm",
    createdAt: minAgo(5),
    likes: 1,
    replies: 0,
    reposts: 0,
    quotes: 0,
    ...over,
  };
}

describe("X aggregation", () => {
  it("returns unavailable status when provider is down", () => {
    const s = aggregateSocial(token, [], { available: false, now });
    expect(s.status).toBe("unavailable");
    expect(s.mentions1h).toBe(0);
  });

  it("bins mentions into time windows", () => {
    const posts = [
      post({ createdAt: minAgo(5) }),
      post({ createdAt: minAgo(10) }),
      post({ createdAt: minAgo(45) }),
      post({ createdAt: minAgo(300) }),
    ];
    const s = aggregateSocial(token, posts, { available: true, now });
    expect(s.mentions15m).toBe(2);
    expect(s.mentions1h).toBe(3);
    expect(s.mentions6h).toBe(4);
    expect(s.mentions24h).toBe(4);
  });

  it("computes unique authors and repeat concentration", () => {
    const posts = [
      post({ authorId: "a1", createdAt: minAgo(5) }),
      post({ authorId: "a1", createdAt: minAgo(6) }),
      post({ authorId: "a2", createdAt: minAgo(7) }),
    ];
    const s = aggregateSocial(token, posts, { available: true, now });
    expect(s.uniqueAuthors).toBe(2);
    // a1 authored 2 of 3 => 66% repeat concentration
    expect(s.repeatAuthorPct).toBe(67);
  });

  it("grounds narrative summary in retrieved posts (source ids stored)", () => {
    const posts = [post({ id: "p1", createdAt: minAgo(5) }), post({ id: "p2", createdAt: minAgo(6) })];
    const s = aggregateSocial(token, posts, { available: true, now });
    expect(s.sourcePostIds).toContain("p1");
    expect(s.narrativeSummary).toContain("$ABC");
  });
});
