import type {
  FomoHolder,
  FomoPosition,
  FomoTrader,
  HolderData,
  NormalizedTrade,
  PairMarketData,
  RiskFlag,
  TokenMarketData,
  TokenSecurityData,
  WalletProfile,
  XPost,
} from "../../domain/types";
import { computeTradeIdempotencyKey } from "../../domain/dedup";
import { sleep } from "../../utils/time";
import type {
  ChainProvider,
  FomoProvider,
  FomoStreamFilter,
  MarketDataProvider,
  WalletIntelProvider,
  XProvider,
  XSearchOptions,
} from "../types";
import { SeededRandom } from "./random";

const DEX = ["raydium", "orca", "meteora", "pumpswap"];

function buildMarket(address: string): TokenMarketData {
  const r = new SeededRandom(`market:${address}`);
  const mc = r.float(12_000, 68_000);
  const liq = r.float(6_000, 40_000);
  const price = r.float(0.00002, 0.004);
  const buys1h = r.int(30, 400);
  const sells1h = Math.round(buys1h * r.float(0.4, 0.95));
  const pair: PairMarketData = {
    pairAddress: `${address.slice(0, 6)}pair`,
    dex: r.pick(DEX),
    quoteAddress: "So11111111111111111111111111111111111111112",
    quoteSymbol: "SOL",
    liquidityUsd: liq,
    priceUsd: price,
    createdAt: new Date(Date.now() - r.int(10, 600) * 60_000),
  };
  return {
    token: {
      chain: "solana",
      address,
      symbol: address.slice(0, 4).toUpperCase(),
      name: `Mock ${address.slice(0, 4)}`,
      decimals: 6,
    },
    priceUsd: price,
    marketCapUsd: mc,
    fdvUsd: mc * r.float(1, 1.4),
    liquidityUsd: liq,
    volume: { m5: r.float(500, 8000), h1: r.float(4000, 90000), h6: r.float(20000, 400000), h24: r.float(50000, 900000) },
    txns: {
      buys15m: r.int(5, 90),
      sells15m: r.int(2, 60),
      buys1h,
      sells1h,
    },
    priceChange: { m5: r.float(-8, 20), h1: r.float(-20, 120), h6: r.float(-40, 300), h24: r.float(-60, 500) },
    pairCount: r.int(1, 4),
    primaryPair: pair,
    pairCreatedAt: pair.createdAt,
    boosts: r.bool(0.2) ? r.int(1, 30) : 0,
    observedAt: new Date(),
    source: "mock",
  };
}

export class MockMarketProvider implements MarketDataProvider {
  readonly name = "mock-market";
  async searchTokens(query: string): Promise<TokenMarketData[]> {
    return [buildMarket(`${query}search1111111111111111111111111`.slice(0, 44))];
  }
  async getToken(address: string): Promise<TokenMarketData | null> {
    return buildMarket(address);
  }
  async getPairs(address: string): Promise<PairMarketData[]> {
    const m = buildMarket(address);
    return m.primaryPair ? [m.primaryPair] : [];
  }
}

export class MockChainProvider implements ChainProvider {
  readonly name = "mock-chain";

  async getTokenSecurity(address: string): Promise<TokenSecurityData> {
    const r = new SeededRandom(`sec:${address}`);
    const top10 = r.float(18, 65);
    const creatorPct = r.float(1, 18);
    const clusterScore = r.float(0, 0.8);
    const flags: RiskFlag[] = [];
    const mint = r.bool(0.25) ? `${address.slice(0, 6)}mint` : null;
    const freeze = r.bool(0.15) ? `${address.slice(0, 6)}frz` : null;
    if (clusterScore > 0.7) {
      flags.push({ code: "CLUSTER", severity: "critical", message: "Strong bundled-cluster launch detected" });
    }
    return {
      token: { chain: "solana", address, symbol: null, name: null, decimals: 6 },
      mintAuthority: mint,
      freezeAuthority: freeze,
      tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      token2022Extensions: [],
      creatorAddress: `${address.slice(0, 6)}creator1111111111111111111`.slice(0, 44),
      creatorBalancePct: creatorPct,
      creatorRecentSellPct: r.bool(0.3) ? r.float(0.5, 8) : 0,
      top10Pct: top10,
      top20Pct: Math.min(90, top10 + r.float(5, 18)),
      suspiciousClusterScore: clusterScore,
      bundledLaunch: r.bool(0.2),
      liquidityChangePct: r.float(-25, 30),
      riskFlags: flags,
      observedAt: new Date(),
      source: "mock",
      status: "ok",
    };
  }

  async getHolders(address: string): Promise<HolderData> {
    const r = new SeededRandom(`hold:${address}`);
    const count = r.int(80, 2200);
    const top10 = r.float(20, 60);
    return {
      token: { chain: "solana", address, symbol: null, name: null, decimals: 6 },
      holderCount: count,
      top10Pct: top10,
      top20Pct: Math.min(92, top10 + r.float(6, 16)),
      topHolderPct: r.float(3, 20),
      observedAt: new Date(),
      source: "mock",
      status: "ok",
    };
  }

  async getWalletTrades(address: string, since?: Date): Promise<NormalizedTrade[]> {
    const r = new SeededRandom(`trades:${address}:${since?.getTime() ?? 0}`);
    const count = r.int(0, 3);
    const out: NormalizedTrade[] = [];
    for (let i = 0; i < count; i++) {
      const tokenAddress = `${address.slice(0, 5)}tok${i}1111111111111111111111111`.slice(0, 44);
      const occurredAt = new Date(Date.now() - r.int(1, 30) * 60_000);
      const sig = `${address.slice(0, 6)}sig${i}${occurredAt.getTime()}`;
      out.push({
        wallet: address,
        tokenAddress,
        side: "BUY",
        amountToken: r.float(1000, 500000),
        amountUsd: r.float(150, 2000),
        occurredAt,
        signature: sig,
        providerEventId: null,
        source: "mock",
        idempotencyKey: computeTradeIdempotencyKey({
          wallet: address,
          tokenAddress,
          side: "BUY",
          occurredAt,
          signature: sig,
          source: "mock",
        }),
      });
    }
    return out;
  }
}

export class MockWalletIntelProvider implements WalletIntelProvider {
  readonly name = "mock-wallet-intel";
  async getWalletProfile(address: string): Promise<WalletProfile | null> {
    const r = new SeededRandom(`wprofile:${address}`);
    return {
      address,
      chain: "solana",
      label: null,
      pnl24h: r.float(-30, 80),
      pnl7d: r.float(-40, 200),
      pnl30d: r.float(-50, 350),
      pnlAll: r.float(-60, 800),
      observedAt: new Date(),
      source: "mock",
    };
  }
  async getWalletActivity(address: string, since?: Date): Promise<NormalizedTrade[]> {
    return new MockChainProvider().getWalletTrades(address, since);
  }
}

export class MockFomoProvider implements FomoProvider {
  readonly name = "mock-fomo";

  async resolveTrader(handle: string): Promise<FomoTrader> {
    return this.getTrader(handle);
  }
  async getTrader(handle: string): Promise<FomoTrader> {
    const r = new SeededRandom(`fomo:${handle}`);
    const wallet = `${handle.slice(0, 5)}fomowallet1111111111111111111`.slice(0, 44);
    return {
      handle,
      wallet,
      profileId: `fomo_${handle}`,
      pnl30d: r.float(-20, 300),
      winRate: r.float(0.3, 0.75),
      accountAgeDays: r.int(30, 900),
      observedAt: new Date(),
      source: "mock",
    };
  }
  async getTraderPositions(handle: string): Promise<FomoPosition[]> {
    const r = new SeededRandom(`fpos:${handle}`);
    const n = r.int(0, 3);
    const out: FomoPosition[] = [];
    for (let i = 0; i < n; i++) {
      out.push({
        handle,
        tokenAddress: `${handle.slice(0, 4)}pos${i}1111111111111111111111111`.slice(0, 44),
        amount: r.float(1000, 100000),
        valueUsd: r.float(100, 3000),
        observedAt: new Date(),
      });
    }
    return out;
  }
  async getTokenHolders(token: string): Promise<FomoHolder[]> {
    const r = new SeededRandom(`fholders:${token}`);
    const n = r.int(0, 5);
    const out: FomoHolder[] = [];
    for (let i = 0; i < n; i++) {
      out.push({
        handle: `trader${i}`,
        wallet: `${token.slice(0, 4)}fh${i}1111111111111111111111111111`.slice(0, 44),
        amount: r.float(1000, 200000),
        valueUsd: r.float(100, 4000),
      });
    }
    return out;
  }
  async *subscribeTrades(_filters: FomoStreamFilter): AsyncIterable<NormalizedTrade> {
    // Dev stub: no live trades. A real adapter connects to the WS feed.
    await sleep(0);
    return;
  }
}

export class MockXProvider implements XProvider {
  readonly name = "mock-x";
  async searchPosts(query: string, options?: XSearchOptions): Promise<XPost[]> {
    const r = new SeededRandom(`x:${query}`);
    const n = r.int(0, options?.maxResults ?? 25);
    const posts: XPost[] = [];
    for (let i = 0; i < n; i++) {
      const authorId = `author${r.int(1, Math.max(2, Math.ceil(n * 0.6)))}`;
      posts.push({
        id: `post_${query}_${i}`,
        authorId,
        authorHandle: authorId,
        text: `Discussion about ${query} on Solana`,
        createdAt: new Date(Date.now() - r.int(1, 24 * 60) * 60_000),
        likes: r.int(0, 200),
        replies: r.int(0, 40),
        reposts: r.int(0, 60),
        quotes: r.int(0, 20),
      });
    }
    return posts;
  }
}
