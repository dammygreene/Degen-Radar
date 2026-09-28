import type { TokenIdentity } from "../types";

export interface XQuerySpec {
  /** The query string to send to X recent search. */
  query: string;
  /** A short label describing what this query targets (stored per post). */
  label: string;
}

/**
 * Build a small set of recent-search queries for a token. We avoid a single
 * bare `$SYMBOL` (ambiguous) and instead combine symbol variants, name and
 * contract address. Retweets are excluded; replies are NOT excluded because
 * replies can carry real narrative discussion. (blueprint §23)
 */
export function buildXQueries(token: TokenIdentity): XQuerySpec[] {
  const specs: XQuerySpec[] = [];
  const symbol = token.symbol?.trim();
  const name = token.name?.trim();

  if (symbol && isUsableSymbol(symbol)) {
    // Combine cashtag and plain symbol to reduce ambiguity without over-narrowing.
    specs.push({
      query: `("$${symbol}" OR "${symbol}") -is:retweet`,
      label: "symbol",
    });
  }

  if (name && isUsableName(name) && name.toLowerCase() !== symbol?.toLowerCase()) {
    specs.push({ query: `"${name}" -is:retweet`, label: "name" });
  }

  // Contract address is the least ambiguous signal.
  specs.push({ query: `"${token.address}" -is:retweet`, label: "contract" });

  return dedupeByQuery(specs);
}

/** Symbols that are too short/ambiguous are skipped to avoid noise. */
function isUsableSymbol(symbol: string): boolean {
  if (symbol.length < 2) return false;
  if (symbol.length > 15) return false;
  return /^[A-Za-z0-9_]+$/.test(symbol);
}

function isUsableName(name: string): boolean {
  return name.length >= 3 && name.length <= 40;
}

function dedupeByQuery(specs: XQuerySpec[]): XQuerySpec[] {
  const seen = new Set<string>();
  const out: XQuerySpec[] = [];
  for (const s of specs) {
    const key = s.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
