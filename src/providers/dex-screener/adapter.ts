import type { PairMarketData, TokenMarketData } from "../../domain/types";
import { HttpClient } from "../http";
import type { MarketDataProvider } from "../types";

/**
 * Minimal shape of the DEX Screener pair object we consume.
 * See https://docs.dexscreener.com/api/reference — kept internal so provider
 * response shapes never leak into domain code.
 */
interface DsPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h6?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  boosts?: { active?: number };
}

interface DsTokenPairsResponse {
  pairs: DsPair[] | null;
}

const numOrNull = (v: number | undefined | null): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export class DexScreenerAdapter implements MarketDataProvider {
  readonly name = "dexscreener";
  private readonly http: HttpClient;

  constructor(baseUrl: string) {
    this.http = new HttpClient({ provider: this.name, baseUrl, timeoutMs: 10_000 });
  }

  private toMarketData(pairs: DsPair[]): TokenMarketData | null {
    const solana = pairs.filter((p) => p.chainId === "solana");
    if (solana.length === 0) return null;
    // Primary pair = highest liquidity.
    const primary = [...solana].sort(
      (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
    )[0]!;

    const totalLiquidity = solana.reduce((sum, p) => sum + (p.liquidity?.usd ?? 0), 0);

    const primaryPair: PairMarketData = {
      pairAddress: primary.pairAddress,
      dex: primary.dexId,
      quoteAddress: primary.quoteToken.address,
      quoteSymbol: primary.quoteToken.symbol ?? null,
      liquidityUsd: numOrNull(primary.liquidity?.usd),
      priceUsd: primary.priceUsd ? Number(primary.priceUsd) : null,
      createdAt: primary.pairCreatedAt ? new Date(primary.pairCreatedAt) : null,
    };

    return {
      token: {
        chain: "solana",
        address: primary.baseToken.address,
        symbol: primary.baseToken.symbol ?? null,
        name: primary.baseToken.name ?? null,
        decimals: null,
      },
      priceUsd: primary.priceUsd ? Number(primary.priceUsd) : null,
      marketCapUsd: numOrNull(primary.marketCap),
      fdvUsd: numOrNull(primary.fdv),
      liquidityUsd: numOrNull(totalLiquidity),
      volume: {
        m5: numOrNull(primary.volume?.m5),
        h1: numOrNull(primary.volume?.h1),
        h6: numOrNull(primary.volume?.h6),
        h24: numOrNull(primary.volume?.h24),
      },
      txns: {
        buys15m: numOrNull(primary.txns?.m5?.buys),
        sells15m: numOrNull(primary.txns?.m5?.sells),
        buys1h: numOrNull(primary.txns?.h1?.buys),
        sells1h: numOrNull(primary.txns?.h1?.sells),
      },
      priceChange: {
        m5: numOrNull(primary.priceChange?.m5),
        h1: numOrNull(primary.priceChange?.h1),
        h6: numOrNull(primary.priceChange?.h6),
        h24: numOrNull(primary.priceChange?.h24),
      },
      pairCount: solana.length,
      primaryPair,
      pairCreatedAt: primary.pairCreatedAt ? new Date(primary.pairCreatedAt) : null,
      boosts: numOrNull(primary.boosts?.active),
      observedAt: new Date(),
      source: this.name,
    };
  }

  async getToken(address: string): Promise<TokenMarketData | null> {
    const res = await this.http.getJson<DsTokenPairsResponse>(
      `/latest/dex/tokens/${encodeURIComponent(address)}`,
    );
    if (!res.pairs || res.pairs.length === 0) return null;
    return this.toMarketData(res.pairs);
  }

  async getPairs(address: string): Promise<PairMarketData[]> {
    const res = await this.http.getJson<DsTokenPairsResponse>(
      `/latest/dex/tokens/${encodeURIComponent(address)}`,
    );
    const pairs = (res.pairs ?? []).filter((p) => p.chainId === "solana");
    return pairs.map((p) => ({
      pairAddress: p.pairAddress,
      dex: p.dexId,
      quoteAddress: p.quoteToken.address,
      quoteSymbol: p.quoteToken.symbol ?? null,
      liquidityUsd: numOrNull(p.liquidity?.usd),
      priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
      createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt) : null,
    }));
  }

  async searchTokens(query: string): Promise<TokenMarketData[]> {
    const res = await this.http.getJson<{ pairs: DsPair[] | null }>(`/latest/dex/search`, {
      query: { q: query },
    });
    const pairs = (res.pairs ?? []).filter((p) => p.chainId === "solana");
    // Group by base token address, build one TokenMarketData per token.
    const byToken = new Map<string, DsPair[]>();
    for (const p of pairs) {
      const arr = byToken.get(p.baseToken.address) ?? [];
      arr.push(p);
      byToken.set(p.baseToken.address, arr);
    }
    const out: TokenMarketData[] = [];
    for (const group of byToken.values()) {
      const md = this.toMarketData(group);
      if (md) out.push(md);
    }
    return out;
  }
}
