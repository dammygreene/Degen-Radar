import { describe, expect, it } from "vitest";
import { computeAcceleration, windowStats } from "../src/domain/x/windows";
import type { XPost } from "../src/domain/types";

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

describe("X window stats", () => {
  it("counts mentions, unique authors and engagement in a window", () => {
    const posts = [
      post({ authorId: "a1", createdAt: minAgo(2), likes: 10, replies: 0 }),
      post({ authorId: "a2", createdAt: minAgo(4), likes: 0, replies: 3 }),
      post({ authorId: "a1", createdAt: minAgo(50) }), // outside 15m
    ];
    const s = windowStats(posts, 15, now);
    expect(s.mentions).toBe(2);
    expect(s.uniqueAuthors).toBe(2);
    expect(s.engagement).toBe(13);
  });
});

describe("X acceleration", () => {
  it("returns INSUFFICIENT_HISTORY with too little signal", () => {
    const res = computeAcceleration([post({ createdAt: minAgo(2) })], 15, now);
    expect(res.state).toBe("INSUFFICIENT_HISTORY");
    expect(res.ratio).toBeNull();
  });

  it("returns NO_PRIOR_ACTIVITY when prior window is empty (no Infinity)", () => {
    const posts = Array.from({ length: 5 }, (_, i) => post({ createdAt: minAgo(i + 1) }));
    const res = computeAcceleration(posts, 15, now);
    expect(res.state).toBe("NO_PRIOR_ACTIVITY");
    expect(res.ratio).toBeNull();
  });

  it("detects ACCELERATING", () => {
    const current = Array.from({ length: 8 }, (_, i) => post({ createdAt: minAgo(i + 1) }));
    const prior = Array.from({ length: 2 }, (_, i) => post({ createdAt: minAgo(16 + i) }));
    const res = computeAcceleration([...current, ...prior], 15, now);
    expect(res.state).toBe("ACCELERATING");
    expect(res.ratio).toBeGreaterThan(1.25);
  });

  it("detects DECELERATING", () => {
    const current = Array.from({ length: 2 }, (_, i) => post({ createdAt: minAgo(i + 1) }));
    const prior = Array.from({ length: 8 }, (_, i) => post({ createdAt: minAgo(16 + i) }));
    const res = computeAcceleration([...current, ...prior], 15, now);
    expect(res.state).toBe("DECELERATING");
  });

  it("detects STABLE", () => {
    const current = Array.from({ length: 5 }, (_, i) => post({ createdAt: minAgo(i + 1) }));
    const prior = Array.from({ length: 5 }, (_, i) => post({ createdAt: minAgo(16 + i) }));
    const res = computeAcceleration([...current, ...prior], 15, now);
    expect(res.state).toBe("STABLE");
  });
});
