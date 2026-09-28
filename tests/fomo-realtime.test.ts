import { describe, expect, it, vi } from "vitest";
import { FomoAdapter } from "../src/providers/fomo/adapter";
import {
  FomoRealtimeManager,
  type IMinimalWebSocket,
} from "../src/providers/fomo/realtime";

class FakeWs implements IMinimalWebSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((d: { data: unknown }) => void) | null = null;
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
  open() {
    this.onopen?.();
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
}

describe("FomoAdapter.normalizeRealtimeTrade", () => {
  it("normalizes a realtime BUY payload", () => {
    const t = FomoAdapter.normalizeRealtimeTrade({
      handle: "alice",
      wallet: "WALLET_A",
      tokenAddress: "TOKEN_X",
      side: "buy",
      amountUsd: 900,
      ts: 1_760_000_000,
      eventId: "E1",
    });
    expect(t).not.toBeNull();
    expect(t!.side).toBe("BUY");
    expect(t!.source).toBe("fomo");
    expect(t!.idempotencyKey).toContain("evt:fomo:E1");
  });

  it("returns null for non-trade / missing fields", () => {
    expect(FomoAdapter.normalizeRealtimeTrade({ side: "buy" })).toBeNull();
    expect(
      FomoAdapter.normalizeRealtimeTrade({ wallet: "W", tokenAddress: "T", side: "hodl" }),
    ).toBeNull();
  });
});

describe("FomoRealtimeManager", () => {
  it("subscribes desired traders on connect and restores after reconnect", async () => {
    const ws = new FakeWs();
    const onTrade = vi.fn();
    const mgr = new FomoRealtimeManager({
      wsUrl: "wss://example",
      apiKey: "k",
      onTrade,
      loadDesiredSubscriptions: async () => ["alice", "bob"],
      wsFactory: () => ws,
    });
    await mgr.start();
    ws.open();
    // Should send a subscribe with restored handles.
    const subMsg = ws.sent.map((s) => JSON.parse(s)).find((m) => m.type === "subscribe");
    expect(subMsg.handles).toContain("alice");
    expect(subMsg.handles).toContain("bob");
    expect(mgr.status().subscriptionCount).toBe(2);
    expect(mgr.status().connected).toBe(true);
    mgr.stop();
  });

  it("forwards normalized trades from inbound messages", () => {
    const ws = new FakeWs();
    const onTrade = vi.fn();
    const mgr = new FomoRealtimeManager({
      wsUrl: "wss://example",
      apiKey: "k",
      onTrade,
      wsFactory: () => ws,
    });
    const trade = mgr.handleMessage(
      JSON.stringify({ wallet: "WALLET_A", tokenAddress: "TOKEN_X", side: "BUY", eventId: "E9" }),
    );
    expect(trade?.side).toBe("BUY");
    expect(onTrade).toHaveBeenCalled();
  });

  it("ignores heartbeat/pong messages", () => {
    const mgr = new FomoRealtimeManager({
      wsUrl: "wss://example",
      apiKey: "k",
      onTrade: vi.fn(),
      wsFactory: () => new FakeWs(),
    });
    expect(mgr.handleMessage(JSON.stringify({ type: "pong" }))).toBeNull();
  });
});
