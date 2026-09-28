import Fastify, { type FastifyInstance } from "fastify";
import { getConfig } from "../config";
import { getSystemHealth } from "../services/health";
import { scanToken } from "../services/scan-orchestrator";
import { assertSolanaAddress } from "../utils/solana-address";
import { getAllProviderHealth } from "../providers/health";
import { verifyHeliusWebhook } from "../providers/helius/adapter";
import { parseHeliusWebhook } from "../providers/helius/parse";
import { enqueue } from "../queues";
import { logger } from "../utils/logger";

/**
 * Radar HTTP API (Fastify). Exposes health, provider status and a read-only
 * scan endpoint. This is research infrastructure — there are no trade routes.
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: false,
    trustProxy: true,
  });

  app.get("/", async () => ({
    name: "degen-radar",
    version: "1.0.0",
    description: "Event-driven Solana memecoin intelligence (research-only).",
    endpoints: ["/health", "/ready", "/providers", "/scan/:address"],
  }));

  app.get("/health", async () => {
    const health = await getSystemHealth();
    return health;
  });

  app.get("/ready", async (_req, reply) => {
    const health = await getSystemHealth();
    // Ready if the process is up; degraded deps are surfaced, not fatal.
    return reply.code(200).send({ ready: health.ok, db: health.db, redis: health.redis });
  });

  app.get("/providers", async () => ({ providers: getAllProviderHealth() }));

  /**
   * Helius webhook receiver. Verifies auth, parses swaps, durably enqueues to
   * the event inbox + chain-events queue, and acknowledges FAST. It never runs a
   * token scan or touches slow providers inside the request. (blueprint §8, §47)
   */
  app.post("/webhooks/helius", async (req, reply) => {
    const cfg = getConfig();
    const auth = req.headers["authorization"];
    const ok = verifyHeliusWebhook(cfg.env.HELIUS_WEBHOOK_SECRET, Array.isArray(auth) ? auth[0] : auth, {
      allowMissingInDev: !cfg.isProduction,
    });
    if (!ok) return reply.code(401).send({ error: "unauthorized" });

    let trades;
    try {
      trades = parseHeliusWebhook(req.body);
    } catch (err) {
      logger.warn({ err }, "helius webhook parse failed");
      return reply.code(400).send({ error: "bad_payload" });
    }

    // Enqueue for async processing. jobId = provider:idempotencyKey dedupes rapid
    // duplicate webhook deliveries at the queue layer; the pipeline then writes
    // the durable event-inbox row (authoritative dedup) before scanning.
    let accepted = 0;
    for (const trade of trades) {
      try {
        const queued = await enqueue("chain-events", "trade", { trade }, {
          jobId: `${trade.source}:${trade.idempotencyKey}`,
        });
        if (queued) accepted++;
      } catch (err) {
        logger.error({ err }, "helius webhook enqueue failed");
      }
    }

    // Acknowledge quickly after enqueue.
    return reply.code(200).send({ received: trades.length, accepted });
  });

  app.get<{ Params: { address: string } }>("/scan/:address", async (req, reply) => {
    let address: string;
    try {
      address = assertSolanaAddress(req.params.address);
    } catch {
      return reply.code(400).send({ error: "invalid_solana_address" });
    }
    try {
      const { result, market } = await scanToken(address, { reason: "MANUAL" });
      return {
        token: result.token,
        score: result.score,
        confidence: result.confidence,
        criticalRisk: result.criticalRisk,
        dataAgeMs: result.dataAgeMs,
        missingSources: result.missingSources,
        market: market
          ? { marketCapUsd: market.marketCapUsd, liquidityUsd: market.liquidityUsd, priceUsd: market.priceUsd }
          : null,
        categories: result.categories,
      };
    } catch (err) {
      req.log?.error?.(err);
      return reply.code(502).send({ error: "scan_failed" });
    }
  });

  // --- Read-only user/data routes (require DB) ---

  app.get<{ Params: { telegramUserId: string } }>(
    "/watchlist/:telegramUserId",
    async (req, reply) => {
      const { getUserByTelegramId } = await import("../services/users/repo");
      const { listWatched } = await import("../services/watchlist/repo");
      const id = Number(req.params.telegramUserId);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "invalid_user_id" });
      const user = await getUserByTelegramId(id);
      if (!user) return reply.code(404).send({ error: "user_not_found" });
      return { user: { id: user.id, telegramUserId: id }, watched: await listWatched(user.id) };
    },
  );

  app.get<{ Params: { address: string } }>("/wallets/:address", async (req, reply) => {
    let address: string;
    try {
      address = assertSolanaAddress(req.params.address);
    } catch {
      return reply.code(400).send({ error: "invalid_solana_address" });
    }
    const { getDb } = await import("../db/client");
    const { wallets } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    if (!db) return reply.code(503).send({ error: "db_unavailable" });
    const row = await db.query.wallets.findFirst({ where: eq(wallets.address, address) });
    return row ?? reply.code(404).send({ error: "not_found" });
  });

  app.get<{ Params: { address: string } }>("/tokens/:address", async (req, reply) => {
    let address: string;
    try {
      address = assertSolanaAddress(req.params.address);
    } catch {
      return reply.code(400).send({ error: "invalid_solana_address" });
    }
    const { getDb } = await import("../db/client");
    const { tokens, scans } = await import("../db/schema");
    const { eq, desc } = await import("drizzle-orm");
    const db = getDb();
    if (!db) return reply.code(503).send({ error: "db_unavailable" });
    const token = await db.query.tokens.findFirst({ where: eq(tokens.address, address) });
    if (!token) return reply.code(404).send({ error: "not_found" });
    const recentScans = await db
      .select()
      .from(scans)
      .where(eq(scans.tokenId, token.id))
      .orderBy(desc(scans.startedAt))
      .limit(10);
    return { token, scans: recentScans };
  });

  app.get<{ Params: { telegramUserId: string } }>(
    "/alerts/:telegramUserId",
    async (req, reply) => {
      const { getUserByTelegramId } = await import("../services/users/repo");
      const { getDb } = await import("../db/client");
      const { alerts } = await import("../db/schema");
      const { eq, desc } = await import("drizzle-orm");
      const id = Number(req.params.telegramUserId);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "invalid_user_id" });
      const db = getDb();
      if (!db) return reply.code(503).send({ error: "db_unavailable" });
      const user = await getUserByTelegramId(id);
      if (!user) return reply.code(404).send({ error: "user_not_found" });
      const rows = await db
        .select()
        .from(alerts)
        .where(eq(alerts.userId, user.id))
        .orderBy(desc(alerts.createdAt))
        .limit(50);
      return { alerts: rows };
    },
  );

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  const cfg = getConfig();
  const app = buildServer();
  await app.listen({ host: cfg.env.HOST, port: cfg.env.PORT });
  return app;
}
