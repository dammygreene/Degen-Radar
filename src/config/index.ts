import { loadEnv, type Env } from "./env";

export interface ScanUniverseConfig {
  minMarketCapUsd: number;
  maxMarketCapUsd: number;
  minLiquidityUsd: number;
}

export interface AlertDefaults {
  minScore: number;
  minConfidence: number;
  convergenceWindowSeconds: number;
  convergenceMinEntities: number;
  maxAlertsPerHour: number;
  tokenCooldownSeconds: number;
}

export interface AppConfig {
  env: Env;
  isProduction: boolean;
  universe: ScanUniverseConfig;
  alerts: AlertDefaults;
  features: {
    x: boolean;
    fomo: boolean;
    birdeye: boolean;
    discovery: boolean;
    mockProviders: boolean;
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const env = loadEnv();
  cached = {
    env,
    isProduction: env.NODE_ENV === "production",
    universe: {
      minMarketCapUsd: env.SCAN_MIN_MC,
      maxMarketCapUsd: env.SCAN_MAX_MC,
      minLiquidityUsd: env.MIN_LIQUIDITY_USD,
    },
    alerts: {
      minScore: env.ALERT_SCORE_THRESHOLD,
      minConfidence: env.ALERT_CONFIDENCE_THRESHOLD,
      convergenceWindowSeconds: env.CONVERGENCE_WINDOW_SECONDS,
      convergenceMinEntities: env.CONVERGENCE_MIN_ENTITIES,
      maxAlertsPerHour: env.MAX_ALERTS_PER_HOUR,
      tokenCooldownSeconds: env.TOKEN_ALERT_COOLDOWN_SECONDS,
    },
    features: {
      x: env.X_SEARCH_ENABLED,
      fomo: env.FOMO_ENABLED,
      birdeye: env.BIRDEYE_ENABLED,
      discovery: env.DISCOVERY_ENABLED,
      mockProviders: env.USE_MOCK_PROVIDERS,
    },
  };
  return cached;
}

export function resetConfigCache(): void {
  cached = null;
}
