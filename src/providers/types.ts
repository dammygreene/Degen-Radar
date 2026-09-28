import type {
  FomoHolder,
  FomoPosition,
  FomoTrader,
  HolderData,
  NormalizedTrade,
  PairMarketData,
  TokenMarketData,
  TokenSecurityData,
  WalletProfile,
  XPost,
} from "../domain/types";

export interface MarketDataProvider {
  readonly name: string;
  searchTokens(query: string): Promise<TokenMarketData[]>;
  getToken(address: string): Promise<TokenMarketData | null>;
  getPairs(address: string): Promise<PairMarketData[]>;
}

export interface ChainProvider {
  readonly name: string;
  getTokenSecurity(address: string): Promise<TokenSecurityData>;
  getHolders(address: string): Promise<HolderData>;
  getWalletTrades(address: string, since?: Date): Promise<NormalizedTrade[]>;
}

export interface WalletIntelProvider {
  readonly name: string;
  getWalletProfile(address: string): Promise<WalletProfile | null>;
  getWalletActivity(address: string, since?: Date): Promise<NormalizedTrade[]>;
}

export interface FomoStreamFilter {
  handles?: string[];
  sides?: ("BUY" | "SELL")[];
}

export interface FomoProvider {
  readonly name: string;
  resolveTrader(handle: string): Promise<FomoTrader>;
  getTrader(handle: string): Promise<FomoTrader>;
  getTraderPositions(handle: string): Promise<FomoPosition[]>;
  getTokenHolders(token: string): Promise<FomoHolder[]>;
  /** Realtime feed. Implementations may poll internally if no WS is available. */
  subscribeTrades(filters: FomoStreamFilter): AsyncIterable<NormalizedTrade>;
}

export interface XSearchOptions {
  maxResults?: number;
  sinceMinutes?: number;
}

export interface XProvider {
  readonly name: string;
  searchPosts(query: string, options?: XSearchOptions): Promise<XPost[]>;
}

export interface ProviderBundle {
  market: MarketDataProvider;
  chain: ChainProvider;
  walletIntel: WalletIntelProvider | null;
  fomo: FomoProvider | null;
  x: XProvider | null;
}
