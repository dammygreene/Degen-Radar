import { describe, expect, it } from "vitest";
import { buildXQueries } from "../src/domain/x/query";
import type { TokenIdentity } from "../src/domain/types";

const token = (over: Partial<TokenIdentity>): TokenIdentity => ({
  chain: "solana",
  address: "So11111111111111111111111111111111111111112",
  symbol: "ABC",
  name: "Alpha Beta",
  decimals: 6,
  ...over,
});

describe("X query builder", () => {
  it("combines symbol variants and excludes retweets, not replies", () => {
    const qs = buildXQueries(token({}));
    const symbolQ = qs.find((q) => q.label === "symbol");
    expect(symbolQ?.query).toContain('"$ABC"');
    expect(symbolQ?.query).toContain('"ABC"');
    expect(symbolQ?.query).toContain("-is:retweet");
    expect(symbolQ?.query).not.toContain("-is:reply");
  });

  it("always includes the contract address query", () => {
    const qs = buildXQueries(token({}));
    expect(qs.some((q) => q.label === "contract")).toBe(true);
  });

  it("skips ambiguous 1-char symbols", () => {
    const qs = buildXQueries(token({ symbol: "A" }));
    expect(qs.some((q) => q.label === "symbol")).toBe(false);
  });

  it("skips name query when it duplicates the symbol", () => {
    const qs = buildXQueries(token({ symbol: "ABC", name: "abc" }));
    expect(qs.some((q) => q.label === "name")).toBe(false);
  });

  it("dedupes identical queries", () => {
    const qs = buildXQueries(token({ symbol: null, name: null }));
    const uniq = new Set(qs.map((q) => q.query));
    expect(uniq.size).toBe(qs.length);
  });
});
