import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").defaultNow().notNull();
const updatedAt = () => ts("updated_at").defaultNow().notNull();

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  alertEnabled: boolean("alert_enabled").default(true).notNull(),
  minAlertScore: integer("min_alert_score").default(75).notNull(),
  minConfidence: integer("min_confidence").default(70).notNull(),
  settings: jsonb("settings").default(sql`'{}'::jsonb`).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const watchGroups = pgTable(
  "watch_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ uniqName: unique().on(t.userId, t.name) }),
);

export const watchedEntities = pgTable(
  "watched_entities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(), // 'wallet' | 'fomo'
    label: text("label"),
    walletAddress: text("wallet_address"),
    fomoHandle: text("fomo_handle"),
    providerIdentity: text("provider_identity"),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uniqWallet: unique("uq_user_wallet").on(t.userId, t.walletAddress),
    uniqFomo: unique("uq_user_fomo").on(t.userId, t.fomoHandle),
    byUser: index("idx_watched_user").on(t.userId),
  }),
);

export const watchGroupMembers = pgTable(
  "watch_group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => watchGroups.id, { onDelete: "cascade" }),
    watchedEntityId: uuid("watched_entity_id")
      .notNull()
      .references(() => watchedEntities.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.groupId, t.watchedEntityId] }) }),
);

export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  address: text("address").notNull().unique(),
  chain: text("chain").default("solana").notNull(),
  label: text("label"),
  clusterId: text("cluster_id"),
  firstSeenAt: ts("first_seen_at").defaultNow().notNull(),
  lastSeenAt: ts("last_seen_at").defaultNow().notNull(),
  pnl24h: numeric("pnl_24h"),
  pnl7d: numeric("pnl_7d"),
  pnl30d: numeric("pnl_30d"),
  pnlAll: numeric("pnl_all"),
});

export const fomoTraders = pgTable("fomo_traders", {
  id: uuid("id").defaultRandom().primaryKey(),
  handle: text("handle").notNull().unique(),
  profileData: jsonb("profile_data").default(sql`'{}'::jsonb`).notNull(),
  lastSyncedAt: ts("last_synced_at"),
  createdAt: createdAt(),
});

export const fomoTraderWallets = pgTable(
  "fomo_trader_wallets",
  {
    fomoTraderId: uuid("fomo_trader_id")
      .notNull()
      .references(() => fomoTraders.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    chain: text("chain").default("solana").notNull(),
    confidence: numeric("confidence"),
    firstSeenAt: ts("first_seen_at").defaultNow().notNull(),
    lastVerifiedAt: ts("last_verified_at").defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.fomoTraderId, t.walletId] }) }),
);

export const tokens = pgTable("tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  chain: text("chain").default("solana").notNull(),
  address: text("address").notNull().unique(),
  symbol: text("symbol"),
  name: text("name"),
  decimals: integer("decimals"),
  firstSeenAt: ts("first_seen_at").defaultNow().notNull(),
  lastSeenAt: ts("last_seen_at").defaultNow().notNull(),
  status: text("status").default("discovered").notNull(),
});

export const tokenPairs = pgTable("token_pairs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenId: uuid("token_id")
    .notNull()
    .references(() => tokens.id, { onDelete: "cascade" }),
  pairAddress: text("pair_address").notNull().unique(),
  dex: text("dex"),
  quoteAddress: text("quote_address"),
  createdAt: createdAt(),
  lastSeenAt: ts("last_seen_at").defaultNow().notNull(),
});

export const tokenSnapshots = pgTable(
  "token_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    capturedAt: ts("captured_at").defaultNow().notNull(),
    priceUsd: numeric("price_usd"),
    marketCapUsd: numeric("market_cap_usd"),
    fdvUsd: numeric("fdv_usd"),
    liquidityUsd: numeric("liquidity_usd"),
    volume15m: numeric("volume_15m"),
    volume1h: numeric("volume_1h"),
    volume6h: numeric("volume_6h"),
    volume24h: numeric("volume_24h"),
    buys15m: integer("buys_15m"),
    sells15m: integer("sells_15m"),
    holders: integer("holders"),
    uniqueBuyers: integer("unique_buyers"),
    uniqueSellers: integer("unique_sellers"),
  },
  (t) => ({
    byTokenTime: index("idx_snap_token_time").on(t.tokenId, t.capturedAt),
    byTime: index("idx_snap_time").on(t.capturedAt),
    byMc: index("idx_snap_mc").on(t.marketCapUsd),
  }),
);

export const tokenSecurity = pgTable(
  "token_security",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    capturedAt: ts("captured_at").defaultNow().notNull(),
    mintAuthority: text("mint_authority"),
    freezeAuthority: text("freeze_authority"),
    tokenProgram: text("token_program"),
    token2022Extensions: jsonb("token2022_extensions").default(sql`'[]'::jsonb`).notNull(),
    creatorAddress: text("creator_address"),
    creatorBalancePct: numeric("creator_balance_pct"),
    top10Pct: numeric("top10_pct"),
    top20Pct: numeric("top20_pct"),
    suspiciousClusterScore: numeric("suspicious_cluster_score"),
    riskFlags: jsonb("risk_flags").default(sql`'[]'::jsonb`).notNull(),
  },
  (t) => ({ byToken: index("idx_sec_token").on(t.tokenId, t.capturedAt) }),
);

export const holders = pgTable(
  "holders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id").references(() => wallets.id, { onDelete: "set null" }),
    capturedAt: ts("captured_at").defaultNow().notNull(),
    balance: numeric("balance"),
    percentage: numeric("percentage"),
    valueUsd: numeric("value_usd"),
  },
  (t) => ({ byToken: index("idx_holders_token").on(t.tokenId, t.capturedAt) }),
);

export const walletTrades = pgTable(
  "wallet_trades",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    side: text("side").notNull(),
    signature: text("signature"),
    providerEventId: text("provider_event_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    amountToken: numeric("amount_token"),
    amountUsd: numeric("amount_usd"),
    occurredAt: ts("occurred_at").notNull(),
    source: text("source").notNull(),
    raw: jsonb("raw"),
  },
  (t) => ({
    byToken: index("idx_trades_token").on(t.tokenId, t.occurredAt),
    byWallet: index("idx_trades_wallet").on(t.walletId, t.occurredAt),
  }),
);

export const walletRelationships = pgTable("wallet_relationships", {
  id: uuid("id").defaultRandom().primaryKey(),
  walletA: uuid("wallet_a")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  walletB: uuid("wallet_b")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  relationshipType: text("relationship_type").notNull(),
  confidence: numeric("confidence"),
  evidence: jsonb("evidence").default(sql`'{}'::jsonb`).notNull(),
  firstSeenAt: ts("first_seen_at").defaultNow().notNull(),
  lastSeenAt: ts("last_seen_at").defaultNow().notNull(),
});

export const fomoPositions = pgTable("fomo_positions", {
  id: uuid("id").defaultRandom().primaryKey(),
  fomoTraderId: uuid("fomo_trader_id")
    .notNull()
    .references(() => fomoTraders.id, { onDelete: "cascade" }),
  tokenId: uuid("token_id")
    .notNull()
    .references(() => tokens.id, { onDelete: "cascade" }),
  capturedAt: ts("captured_at").defaultNow().notNull(),
  amount: numeric("amount"),
  valueUsd: numeric("value_usd"),
  source: text("source").notNull(),
});

export const socialSnapshots = pgTable(
  "social_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    capturedAt: ts("captured_at").defaultNow().notNull(),
    mentions15m: integer("mentions_15m").default(0).notNull(),
    mentions1h: integer("mentions_1h").default(0).notNull(),
    mentions6h: integer("mentions_6h").default(0).notNull(),
    mentions24h: integer("mentions_24h").default(0).notNull(),
    uniqueAuthors: integer("unique_authors").default(0).notNull(),
    likes: integer("likes").default(0).notNull(),
    replies: integer("replies").default(0).notNull(),
    quotes: integer("quotes").default(0).notNull(),
    repeatAuthorPct: numeric("repeat_author_pct"),
    narrativeScore: numeric("narrative_score"),
    narrativeSummary: text("narrative_summary"),
    sourcePostIds: jsonb("source_post_ids").default(sql`'[]'::jsonb`).notNull(),
  },
  (t) => ({ byToken: index("idx_social_token").on(t.tokenId, t.capturedAt) }),
);

export const convergenceEvents = pgTable("convergence_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenId: uuid("token_id")
    .notNull()
    .references(() => tokens.id, { onDelete: "cascade" }),
  startedAt: ts("started_at").notNull(),
  endedAt: ts("ended_at"),
  entityCount: integer("entity_count").notNull(),
  uniqueWalletCount: integer("unique_wallet_count").notNull(),
  fomoCount: integer("fomo_count").notNull(),
  clusterAdjustedCount: integer("cluster_adjusted_count").notNull(),
  totalUsd: numeric("total_usd"),
  status: text("status").default("open").notNull(),
});

export const convergenceMembers = pgTable("convergence_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  convergenceId: uuid("convergence_id")
    .notNull()
    .references(() => convergenceEvents.id, { onDelete: "cascade" }),
  watchedEntityId: uuid("watched_entity_id").references(() => watchedEntities.id, {
    onDelete: "set null",
  }),
  walletId: uuid("wallet_id").references(() => wallets.id, { onDelete: "set null" }),
  eventId: text("event_id"),
  enteredAt: ts("entered_at").notNull(),
  amountUsd: numeric("amount_usd"),
});

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    triggerType: text("trigger_type").notNull(),
    triggerEntityId: uuid("trigger_entity_id"),
    status: text("status").default("REQUESTED").notNull(),
    startedAt: ts("started_at").defaultNow().notNull(),
    completedAt: ts("completed_at"),
    score: integer("score"),
    confidence: integer("confidence"),
    missingSources: jsonb("missing_sources").default(sql`'[]'::jsonb`).notNull(),
    errorSummary: text("error_summary"),
  },
  (t) => ({ byToken: index("idx_scans_token").on(t.tokenId, t.startedAt) }),
);

export const scanSignals = pgTable("scan_signals", {
  id: uuid("id").defaultRandom().primaryKey(),
  scanId: uuid("scan_id")
    .notNull()
    .references(() => scans.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  direction: text("direction").notNull(),
  points: numeric("points").notNull(),
  maxPoints: numeric("max_points").notNull(),
  reason: text("reason").notNull(),
  evidence: jsonb("evidence").default(sql`'{}'::jsonb`).notNull(),
});

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    alertType: text("alert_type").notNull(),
    scanId: uuid("scan_id").references(() => scans.id, { onDelete: "set null" }),
    score: integer("score"),
    confidence: integer("confidence"),
    payload: jsonb("payload").default(sql`'{}'::jsonb`).notNull(),
    sentAt: ts("sent_at"),
    suppressed: boolean("suppressed").default(false).notNull(),
    suppressionReason: text("suppression_reason"),
    createdAt: createdAt(),
  },
  (t) => ({ byUser: index("idx_alerts_user").on(t.userId, t.createdAt) }),
);

export const outcomeSnapshots = pgTable(
  "outcome_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    detectionScanId: uuid("detection_scan_id").references(() => scans.id, { onDelete: "set null" }),
    checkpoint: text("checkpoint").notNull(), // detection, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 7d
    capturedAt: ts("captured_at").defaultNow().notNull(),
    marketCapUsd: numeric("market_cap_usd"),
    liquidityUsd: numeric("liquidity_usd"),
    priceUsd: numeric("price_usd"),
    radarScore: integer("radar_score"),
    confidence: integer("confidence"),
  },
  (t) => ({
    uniqCheckpoint: unique("uq_outcome_checkpoint").on(t.tokenId, t.detectionScanId, t.checkpoint),
    byToken: index("idx_outcome_token").on(t.tokenId, t.capturedAt),
  }),
);

export const providerHealth = pgTable("provider_health", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull(),
  capturedAt: ts("captured_at").defaultNow().notNull(),
  latencyMs: integer("latency_ms"),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  rateLimitRemaining: integer("rate_limit_remaining"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
});

export const schema = {
  users,
  watchGroups,
  watchedEntities,
  watchGroupMembers,
  wallets,
  fomoTraders,
  fomoTraderWallets,
  tokens,
  tokenPairs,
  tokenSnapshots,
  tokenSecurity,
  holders,
  walletTrades,
  walletRelationships,
  fomoPositions,
  socialSnapshots,
  convergenceEvents,
  convergenceMembers,
  scans,
  scanSignals,
  alerts,
  outcomeSnapshots,
  providerHealth,
};
