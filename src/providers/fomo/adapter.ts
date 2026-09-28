import { computeTradeIdempotencyKey } from "../../domain/dedup";
import type {
  FomoHolder,
  FomoPosition,
  FomoTrader,
  NormalizedTrade,
} from "../../domain/types";
import { ProviderError } from "../../utils/errors";
import { normalizeHandle } from "../../utils/solana-address";
import { HttpClient } from "../http";
import type { FomoProvider, FomoStreamFilter } from "../types";

/**
 * Real FOMO API adapter (api.fomoapi.io). FOMO API is an INDEPENDENT/UNOFFICIAL
 * data layer for fomo.family — never represented as official. Response shapes
 * are kept inside this adapter and mapped into domain types.
 */
interface FomoUserResponse {
  handle?: string;
  username?: string;
  id?: string;
  wallets?: { address: string; chain?: string }[];
  solanaWallet?: string;
  pnl?: { d30?: number; d7?: number; d1?: number };
  pnl30d?: number;
  winRate?: number;
  accountAgeDays?: number;
}

interface FomoHoldersResponse {
  holders?: {
    handle?: string;
    username?: string;
    wallet?: string;
    walletAddress?: string;
    amount?: number;
    valueUsd?: number;
    priceUsd?: number;
  }[];
}

export class FomoAdapter implements FomoProvider {
  readonly name = "fomo";
  private readonly http: HttpClient;

  constructor(baseUrl: string, apiKey: string) {
    this.http = new HttpClient({
      provider: this.name,
      baseUrl,
      timeoutMs: 10_000,
      defaultHeaders: { authorization: `Bearer ${apiKey}` },
    });
  }

  private mapTrader(res: FomoUserResponse, fallbackHandle: string): FomoTrader {
    const wallet =
      res.solanaWallet ??
      res.wallets?.find((w) => (w.chain ?? "solana").toLowerCase() === "solana")?.address ??
      null;
    return {
      handle: normalizeHandle(res.handle ?? res.username ?? fallbackHandle),
      wallet,
      profileId: res.id ?? null,
      pnl30d: res.pnl?.d30 ?? res.pnl30d ?? null,
      winRate: res.winRate ?? null,
      accountAgeDays: res.accountAgeDays ?? null,
      observedAt: new Date(),
      source: this.name,
    };
  }

  async resolveTrader(handle: string): Promise<FomoTrader> {
    return this.getTrader(handle);
  }

  async getTrader(handle: string): Promise<FomoTrader> {
    const h = normalizeHandle(handle);
    const res = await this.http.getJson<FomoUserResponse>(`/v2/users/${encodeURIComponent(h)}`);
    if (!res || (!res.wallets && !res.solanaWallet && !res.id)) {
      throw new ProviderError(this.name, `FOMO trader not found: @${h}`, { retryable: false });
    }
    return this.mapTrader(res, h);
  }

  /** Returns ALL resolved wallets for a handle (a trader may have several). */
  async getTraderWallets(handle: string): Promise<string[]> {
    const h = normalizeHandle(handle);
    const res = await this.http.getJson<FomoUserResponse>(`/v2/users/${encodeURIComponent(h)}`);
    const set = new Set<string>();
    if (res.solanaWallet) set.add(res.solanaWallet);
    for (const w of res.wallets ?? []) if (w.address) set.add(w.address);
    return [...set];
  }

  async getTraderPositions(handle: string): Promise<FomoPosition[]> {
    const h = normalizeHandle(handle);
    const res = await this.http.getJson<{
      positions?: { tokenAddress?: string; mint?: string; amount?: number; valueUsd?: number }[];
    }>(`/v2/users/${encodeURIComponent(h)}/balances`);
    return (res.positions ?? [])
      .filter((p) => p.tokenAddress || p.mint)
      .map((p) => ({
        handle: h,
        tokenAddress: (p.tokenAddress ?? p.mint)!,
        amount: p.amount ?? null,
        valueUsd: p.valueUsd ?? null,
        observedAt: new Date(),
      }));
  }

  async getTokenHolders(token: string): Promise<FomoHolder[]> {
    const res = await this.http.getJson<FomoHoldersResponse>(
      `/token/${encodeURIComponent(token)}/holders`,
    );
    return (res.holders ?? []).map((h) => ({
      handle: h.handle ?? h.username ?? null,
      wallet: (h.wallet ?? h.walletAddress ?? "") || "",
      amount: h.amount ?? null,
      valueUsd: h.valueUsd ?? null,
    }));
  }

  // Realtime is handled by FomoRealtimeManager; the pull-style iterator is a
  // no-op here so the interface stays satisfied.
  async *subscribeTrades(_filters: FomoStreamFilter): AsyncIterable<NormalizedTrade> {
    return;
  }

  /** Normalize a realtime FOMO trade payload into a domain trade. */
  static normalizeRealtimeTrade(payload: unknown): NormalizedTrade | null {
    const p = payload as {
      handle?: string;
      wallet?: string;
      walletAddress?: string;
      tokenAddress?: string;
      mint?: string;
      side?: string;
      action?: string;
      amount?: number;
      amountToken?: number;
      valueUsd?: number;
      amountUsd?: number;
      ts?: number;
      timestamp?: number;
      eventId?: string;
      id?: string;
    };
    const wallet = p.wallet ?? p.walletAddress;
    const tokenAddress = p.tokenAddress ?? p.mint;
    const rawSide = (p.side ?? p.action ?? "").toUpperCase();
    if (!wallet || !tokenAddress) return null;
    if (rawSide !== "BUY" && rawSide !== "SELL") return null;
    const side = rawSide as "BUY" | "SELL";
    const occurredAt = p.ts ? new Date(p.ts * 1000) : p.timestamp ? new Date(p.timestamp) : new Date();
    const providerEventId = p.eventId ?? p.id ?? null;
    return {
      wallet,
      tokenAddress,
      side,
      amountToken: p.amountToken ?? p.amount ?? null,
      amountUsd: p.amountUsd ?? p.valueUsd ?? null,
      occurredAt,
      signature: null,
      providerEventId,
      source: "fomo",
      idempotencyKey: computeTradeIdempotencyKey({
        wallet,
        tokenAddress,
        side,
        occurredAt,
        amountUsd: p.amountUsd ?? p.valueUsd ?? null,
        providerEventId,
        source: "fomo",
      }),
      classifierConfidence: 0.85,
    };
  }
}
