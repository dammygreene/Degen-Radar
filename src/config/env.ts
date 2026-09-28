import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

/**
 * Central, validated configuration. Nothing in the codebase should read
 * `process.env` directly outside of this module.
 */
const boolish = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(["true", "false", "1", "0", "yes", "no"]))
  .transform((v) => v === "true" || v === "1" || v === "yes");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().optional(),

  // Infrastructure
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // Solana
  SOLANA_RPC_URL: z.string().optional(),
  SOLANA_WS_URL: z.string().optional(),

  // Helius (indexed Solana events / parsed history / webhooks)
  HELIUS_API_KEY: z.string().optional(),
  HELIUS_BASE_URL: z.string().default("https://api.helius.xyz"),
  HELIUS_WEBHOOK_SECRET: z.string().optional(),
  HELIUS_ENABLED: boolish.default("true"),
  WALLET_BACKFILL_TX_LIMIT: z.coerce.number().int().default(100),
  WALLET_BACKFILL_ENABLED: boolish.default("true"),
  BACKFILL_ALERTS_ENABLED: boolish.default("false"),

  // Providers
  FOMO_API_KEY: z.string().optional(),
  FOMO_BASE_URL: z.string().default("https://api.fomoapi.io"),
  FOMO_WS_URL: z.string().default("wss://api.fomoapi.io/ws/alerts"),
  X_BEARER_TOKEN: z.string().optional(),
  X_BASE_URL: z.string().default("https://api.x.com"),
  BIRDEYE_API_KEY: z.string().optional(),
  BIRDEYE_BASE_URL: z.string().default("https://public-api.birdeye.so"),
  DEXSCREENER_BASE_URL: z.string().default("https://api.dexscreener.com"),

  // Market universe defaults
  SCAN_MIN_MC: z.coerce.number().default(10_000),
  SCAN_MAX_MC: z.coerce.number().default(70_000),
  MIN_LIQUIDITY_USD: z.coerce.number().default(8_000),

  // Alert defaults
  ALERT_SCORE_THRESHOLD: z.coerce.number().default(75),
  ALERT_CONFIDENCE_THRESHOLD: z.coerce.number().default(70),
  CONVERGENCE_WINDOW_SECONDS: z.coerce.number().default(900),
  CONVERGENCE_MIN_ENTITIES: z.coerce.number().default(2),
  MAX_ALERTS_PER_HOUR: z.coerce.number().default(5),
  TOKEN_ALERT_COOLDOWN_SECONDS: z.coerce.number().default(900),

  // Feature flags
  X_SEARCH_ENABLED: boolish.default("true"),
  FOMO_ENABLED: boolish.default("true"),
  BIRDEYE_ENABLED: boolish.default("true"),
  DISCOVERY_ENABLED: boolish.default("true"),

  // When true, provider adapters that lack credentials fall back to
  // deterministic in-repo development fixtures instead of real HTTP calls.
  // Never enable in production.
  USE_MOCK_PROVIDERS: boolish.default("false"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests: reset the memoized env so a fresh process.env can be re-read. */
export function resetEnvCache(): void {
  cached = null;
}
