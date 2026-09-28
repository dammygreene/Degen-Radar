import { getConfig } from "../config";
import { logger } from "../utils/logger";
import { DexScreenerAdapter } from "./dex-screener/adapter";
import {
  MockChainProvider,
  MockFomoProvider,
  MockMarketProvider,
  MockWalletIntelProvider,
  MockXProvider,
} from "./dev/mock-adapters";
import { SolanaChainAdapter } from "./solana/adapter";
import type { ProviderBundle } from "./types";

let cached: ProviderBundle | null = null;

/**
 * Build the active provider set. Real adapters are used when credentials exist;
 * otherwise (or when USE_MOCK_PROVIDERS=true) deterministic dev adapters are
 * substituted so the system stays runnable and degrades gracefully.
 */
export function getProviders(): ProviderBundle {
  if (cached) return cached;
  const cfg = getConfig();
  const useMock = cfg.features.mockProviders;

  // Market: real DEX Screener needs no key. Use mock only when explicitly asked.
  const market = useMock
    ? new MockMarketProvider()
    : new DexScreenerAdapter(cfg.env.DEXSCREENER_BASE_URL);

  // Chain (security/holders): a real Solana adapter needs an RPC URL + indexer.
  // Without one we fall back to the dev adapter and mark confidence accordingly.
  const hasSolana = Boolean(cfg.env.SOLANA_RPC_URL) && !useMock;
  const chain = hasSolana
    ? new SolanaChainAdapter(cfg.env.SOLANA_RPC_URL!)
    : new MockChainProvider();
  if (!hasSolana) {
    logger.warn("No SOLANA_RPC_URL configured — using dev chain adapter (reduced confidence).");
  }

  const walletIntel =
    cfg.features.birdeye && (cfg.env.BIRDEYE_API_KEY || useMock)
      ? new MockWalletIntelProvider()
      : new MockWalletIntelProvider();

  const fomo =
    cfg.features.fomo && (cfg.env.FOMO_API_KEY || useMock) ? new MockFomoProvider() : null;
  if (cfg.features.fomo && !fomo) {
    logger.warn("FOMO enabled but FOMO_API_KEY missing — FOMO provider disabled.");
  }

  const x = cfg.features.x && (cfg.env.X_BEARER_TOKEN || useMock) ? new MockXProvider() : null;
  if (cfg.features.x && !x) {
    logger.warn("X enabled but X_BEARER_TOKEN missing — narrative intel disabled.");
  }

  cached = { market, chain, walletIntel, fomo, x };
  return cached;
}

export function resetProviderCache(): void {
  cached = null;
}
