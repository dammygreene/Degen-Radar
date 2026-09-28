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
import { FomoAdapter } from "./fomo/adapter";
import { HeliusAdapter } from "./helius/adapter";
import { SolanaChainAdapter } from "./solana/adapter";
import { XAdapter } from "./x/adapter";
import type {
  ChainEventProvider,
  FomoProvider,
  ProviderBundle,
  XProvider,
} from "./types";

let cached: ProviderBundle | null = null;

/**
 * Build the active provider set.
 *
 * Production rule (blueprint §49): when a provider has no credentials it is
 * DISABLED (null) and scans degrade with lower confidence — it is NEVER
 * silently replaced with fake data. Deterministic dev mocks are only used when
 * USE_MOCK_PROVIDERS=true (explicit offline/demo mode).
 */
export function getProviders(): ProviderBundle {
  if (cached) return cached;
  const cfg = getConfig();
  const useMock = cfg.features.mockProviders;

  // Market: real DEX Screener needs no key.
  const market = useMock
    ? new MockMarketProvider()
    : new DexScreenerAdapter(cfg.env.DEXSCREENER_BASE_URL);

  // Chain state (authorities): real Solana RPC when configured.
  const hasSolana = Boolean(cfg.env.SOLANA_RPC_URL) && !useMock;
  const chain = hasSolana
    ? new SolanaChainAdapter(cfg.env.SOLANA_RPC_URL!)
    : new MockChainProvider();
  if (!hasSolana && !useMock) {
    logger.warn("No SOLANA_RPC_URL configured — using dev chain adapter (reduced confidence).");
  }

  // Helius indexed events / backfill / webhooks.
  let chainEvents: ChainEventProvider | null = null;
  if (cfg.features.helius && cfg.env.HELIUS_API_KEY && !useMock) {
    chainEvents = new HeliusAdapter(
      cfg.env.HELIUS_BASE_URL,
      cfg.env.HELIUS_API_KEY,
      undefined,
    );
  } else if (cfg.features.helius && !useMock) {
    logger.warn("HELIUS enabled but HELIUS_API_KEY missing — indexed wallet events disabled.");
  }

  const walletIntel = new MockWalletIntelProvider();

  // FOMO: real adapter when key present; mock only in explicit mock mode.
  let fomo: FomoProvider | null = null;
  if (useMock) fomo = new MockFomoProvider();
  else if (cfg.features.fomo && cfg.env.FOMO_API_KEY) {
    fomo = new FomoAdapter(cfg.env.FOMO_BASE_URL, cfg.env.FOMO_API_KEY);
  } else if (cfg.features.fomo) {
    logger.warn("FOMO enabled but FOMO_API_KEY missing — FOMO provider disabled.");
  }

  // X: real recent-search when bearer token present; mock only in mock mode.
  let x: XProvider | null = null;
  if (useMock) x = new MockXProvider();
  else if (cfg.features.x && cfg.env.X_BEARER_TOKEN) {
    x = new XAdapter(cfg.env.X_BASE_URL, cfg.env.X_BEARER_TOKEN);
  } else if (cfg.features.x) {
    logger.warn("X enabled but X_BEARER_TOKEN missing — narrative intel disabled.");
  }

  cached = { market, chain, chainEvents, walletIntel, fomo, x };
  return cached;
}

export function resetProviderCache(): void {
  cached = null;
}
