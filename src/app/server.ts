import Fastify, { type FastifyInstance } from "fastify";
import { getConfig } from "../config";
import { getSystemHealth } from "../services/health";
import { scanToken } from "../services/scan-orchestrator";
import { assertSolanaAddress } from "../utils/solana-address";
import { getAllProviderHealth } from "../providers/health";

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

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  const cfg = getConfig();
  const app = buildServer();
  await app.listen({ host: cfg.env.HOST, port: cfg.env.PORT });
  return app;
}
