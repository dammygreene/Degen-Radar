import type { NormalizedTrade } from "../../domain/types";
import { logger } from "../../utils/logger";
import { FomoAdapter } from "./adapter";

export interface RealtimeStatus {
  connected: boolean;
  connectedAt: Date | null;
  lastMessageAt: Date | null;
  lastHeartbeatAt: Date | null;
  reconnectCount: number;
  subscriptionCount: number;
}

export interface FomoRealtimeOptions {
  wsUrl: string;
  apiKey: string;
  onTrade: (trade: NormalizedTrade) => void | Promise<void>;
  /** Restores desired subscriptions after (re)connect. */
  loadDesiredSubscriptions?: () => Promise<string[]>;
  baseReconnectMs?: number;
  maxReconnectMs?: number;
  heartbeatMs?: number;
  /** Injectable WebSocket factory for tests. */
  wsFactory?: (url: string) => IMinimalWebSocket;
}

/** The tiny subset of the WebSocket surface we depend on (test-friendly). */
export interface IMinimalWebSocket {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((err: unknown) => void) | null;
  onmessage: ((data: { data: unknown }) => void) | null;
}

/**
 * Centralized FOMO realtime manager. One logical connection; dynamic trader
 * filters; automatic reconnect with exponential backoff + jitter; subscription
 * restoration after reconnect/restart. The rest of the app never touches WS
 * internals — it calls watchTrader/unwatchTrader. (blueprint §14–15, §46)
 */
export class FomoRealtimeManager {
  private ws: IMinimalWebSocket | null = null;
  private readonly handles = new Set<string>();
  private reconnectCount = 0;
  private connectedAt: Date | null = null;
  private lastMessageAt: Date | null = null;
  private lastHeartbeatAt: Date | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private closing = false;

  constructor(private readonly opts: FomoRealtimeOptions) {}

  status(): RealtimeStatus {
    return {
      connected: this.ws !== null && this.connectedAt !== null,
      connectedAt: this.connectedAt,
      lastMessageAt: this.lastMessageAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      reconnectCount: this.reconnectCount,
      subscriptionCount: this.handles.size,
    };
  }

  async start(): Promise<void> {
    this.closing = false;
    if (this.opts.loadDesiredSubscriptions) {
      for (const h of await this.opts.loadDesiredSubscriptions()) this.handles.add(h);
    }
    this.connect();
  }

  async watchTrader(handle: string): Promise<void> {
    this.handles.add(handle);
    if (this.isOpen()) this.sendSubscribe([handle]);
  }

  async unwatchTrader(handle: string): Promise<void> {
    this.handles.delete(handle);
    if (this.isOpen()) this.send({ type: "unsubscribe", handles: [handle] });
  }

  stop(): void {
    this.closing = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.ws?.close();
    this.ws = null;
    this.connectedAt = null;
  }

  private isOpen(): boolean {
    return this.ws !== null && this.connectedAt !== null;
  }

  private defaultWsFactory(url: string): IMinimalWebSocket {
    // Lazy require so the ws dependency is only needed when realtime is used.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WsCtor = require("ws") as new (u: string, opts?: unknown) => IMinimalWebSocket;
    return new WsCtor(url, { headers: { authorization: `Bearer ${this.opts.apiKey}` } });
  }

  private connect(): void {
    const factory = this.opts.wsFactory ?? ((u: string) => this.defaultWsFactory(u));
    let ws: IMinimalWebSocket;
    try {
      ws = factory(this.opts.wsUrl);
    } catch (err) {
      logger.error({ err }, "fomo ws factory failed");
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.connectedAt = new Date();
      this.reconnectCount = 0;
      logger.info({ subscriptions: this.handles.size }, "fomo realtime connected");
      if (this.handles.size > 0) this.sendSubscribe([...this.handles]);
      this.startHeartbeat();
    };

    ws.onmessage = ({ data }) => {
      this.lastMessageAt = new Date();
      this.handleMessage(data);
    };

    ws.onerror = (err) => logger.warn({ err }, "fomo realtime error");

    ws.onclose = () => {
      this.connectedAt = null;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      if (!this.closing) this.scheduleReconnect();
    };
  }

  private startHeartbeat(): void {
    const interval = this.opts.heartbeatMs ?? 25_000;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.lastHeartbeatAt = new Date();
      this.send({ type: "ping" });
    }, interval);
    // Don't keep the process alive solely for heartbeats.
    this.heartbeatTimer.unref?.();
  }

  private scheduleReconnect(): void {
    this.reconnectCount++;
    const base = this.opts.baseReconnectMs ?? 1_000;
    const max = this.opts.maxReconnectMs ?? 30_000;
    const backoff = Math.min(max, base * Math.pow(2, this.reconnectCount - 1));
    const jittered = Math.round(backoff * (0.5 + Math.random() * 0.5));
    logger.warn({ attempt: this.reconnectCount, delayMs: jittered }, "fomo realtime reconnecting");
    const t = setTimeout(() => this.connect(), jittered);
    t.unref?.();
  }

  private sendSubscribe(handles: string[]): void {
    this.send({ type: "subscribe", handles });
  }

  private send(obj: unknown): void {
    try {
      this.ws?.send(JSON.stringify(obj));
    } catch (err) {
      logger.debug({ err }, "fomo realtime send failed");
    }
  }

  /** Exposed for tests: process a raw inbound message. */
  handleMessage(data: unknown): NormalizedTrade | null {
    let parsed: unknown;
    try {
      parsed = typeof data === "string" ? JSON.parse(data) : data;
    } catch {
      return null;
    }
    const obj = parsed as { type?: string };
    if (obj?.type === "pong" || obj?.type === "heartbeat") {
      this.lastHeartbeatAt = new Date();
      return null;
    }
    const trade = FomoAdapter.normalizeRealtimeTrade(parsed);
    if (trade) {
      // Only forward trades for currently-watched handles when the payload
      // carries a handle we can check.
      void Promise.resolve(this.opts.onTrade(trade)).catch((err) =>
        logger.error({ err }, "fomo onTrade handler failed"),
      );
    }
    return trade;
  }
}
