import { timingSafeEqual } from "node:crypto";
import type { NormalizedTrade } from "../../domain/types";
import { logger } from "../../utils/logger";
import { HttpClient } from "../http";
import type { ChainEventProvider } from "../types";
import { parseHeliusTransaction, parseHeliusWebhook } from "./parse";
import type { HeliusEnhancedTransaction } from "./types";

/**
 * Helius adapter for indexed Solana wallet activity.
 *
 * - `backfillWallet` uses the parsed address-transactions API.
 * - `parseTradeEvent` normalizes enhanced transactions (also used by the
 *   webhook receiver).
 * - `subscribeWallet` / `unsubscribeWallet` manage a Helius webhook's watched
 *   address list.
 *
 * Webhook registration/mutation requires a Helius account + webhook id; when
 * not configured these are no-ops that log intent (degraded mode).
 */
export class HeliusAdapter implements ChainEventProvider {
  readonly name = "helius";
  private readonly http: HttpClient;
  private readonly apiKey: string;
  private readonly webhookId: string | undefined;

  constructor(baseUrl: string, apiKey: string, webhookId?: string) {
    this.apiKey = apiKey;
    this.webhookId = webhookId;
    this.http = new HttpClient({ provider: this.name, baseUrl, timeoutMs: 12_000 });
  }

  parseTradeEvent(input: unknown): NormalizedTrade[] {
    if (Array.isArray(input)) return parseHeliusWebhook(input);
    return parseHeliusTransaction(input as HeliusEnhancedTransaction);
  }

  async backfillWallet(wallet: string, txLimit: number): Promise<NormalizedTrade[]> {
    try {
      const txs = await this.http.getJson<HeliusEnhancedTransaction[]>(
        `/v0/addresses/${encodeURIComponent(wallet)}/transactions`,
        { query: { "api-key": this.apiKey, limit: Math.min(txLimit, 100), type: "SWAP" } },
      );
      const trades: NormalizedTrade[] = [];
      for (const tx of txs) {
        trades.push(
          ...parseHeliusTransaction(tx, { targetWallets: new Set([wallet]), backfill: true }),
        );
      }
      logger.info({ wallet, count: trades.length }, "helius backfill complete");
      return trades;
    } catch (err) {
      logger.warn({ err, wallet }, "helius backfill failed (degrading)");
      return [];
    }
  }

  async subscribeWallet(wallet: string): Promise<void> {
    if (!this.webhookId) {
      logger.warn({ wallet }, "helius webhook id not configured — subscription is logical only");
      return;
    }
    await this.mutateWebhookAddresses(wallet, "add");
  }

  async unsubscribeWallet(wallet: string): Promise<void> {
    if (!this.webhookId) return;
    await this.mutateWebhookAddresses(wallet, "remove");
  }

  private async mutateWebhookAddresses(wallet: string, op: "add" | "remove"): Promise<void> {
    try {
      const current = await this.http.getJson<{ accountAddresses?: string[] }>(
        `/v0/webhooks/${this.webhookId}`,
        { query: { "api-key": this.apiKey } },
      );
      const set = new Set(current.accountAddresses ?? []);
      if (op === "add") set.add(wallet);
      else set.delete(wallet);
      await this.http.request(`/v0/webhooks/${this.webhookId}`, {
        method: "PUT",
        query: { "api-key": this.apiKey },
        body: { accountAddresses: [...set] },
      });
      logger.info({ wallet, op, total: set.size }, "helius webhook addresses updated");
    } catch (err) {
      logger.error({ err, wallet, op }, "helius webhook address mutation failed");
      throw err;
    }
  }
}

/**
 * Verify a Helius webhook request. Helius sends the configured value in the
 * `Authorization` header; we compare it to `HELIUS_WEBHOOK_SECRET` using a
 * constant-time comparison. Returns true when no secret is configured only in
 * non-production (dev convenience) — production must set a secret.
 */
export function verifyHeliusWebhook(
  secret: string | undefined,
  headerValue: string | undefined,
  opts: { allowMissingInDev?: boolean } = {},
): boolean {
  if (!secret) return Boolean(opts.allowMissingInDev);
  if (!headerValue) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(headerValue);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
