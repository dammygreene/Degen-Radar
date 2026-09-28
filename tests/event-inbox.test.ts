import { describe, expect, it } from "vitest";
import { InMemoryEventInbox } from "../src/services/event-inbox/memory";

function input(over: Partial<Parameters<InMemoryEventInbox["enqueue"]>[0]> = {}) {
  return {
    eventType: "wallet.buy.detected",
    provider: "helius",
    providerEventId: "SIG1",
    idempotencyKey: "sig:SIG1:WALLET_A",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    payload: { hello: "world" },
    ...over,
  };
}

describe("event inbox", () => {
  it("inserts a new event", async () => {
    const inbox = new InMemoryEventInbox();
    const res = await inbox.enqueue(input());
    expect(res.inserted).toBe(true);
    expect(res.event?.status).toBe("PENDING");
  });

  it("rejects duplicates on (provider, idempotencyKey)", async () => {
    const inbox = new InMemoryEventInbox();
    await inbox.enqueue(input());
    const dup = await inbox.enqueue(input());
    expect(dup.inserted).toBe(false);
    expect(inbox.size()).toBe(1);
  });

  it("allows same idempotency key from a different provider", async () => {
    const inbox = new InMemoryEventInbox();
    await inbox.enqueue(input({ provider: "helius" }));
    const other = await inbox.enqueue(input({ provider: "fomo" }));
    expect(other.inserted).toBe(true);
  });

  it("claims pending events and increments attempt count", async () => {
    const inbox = new InMemoryEventInbox();
    await inbox.enqueue(input());
    const claimed = await inbox.claimPending(10);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.status).toBe("PROCESSING");
    expect(claimed[0]!.attemptCount).toBe(1);
    // Already claimed -> not returned again.
    expect(await inbox.claimPending(10)).toHaveLength(0);
  });

  it("marks processed and failed, and retries failed", async () => {
    const inbox = new InMemoryEventInbox();
    const { event } = await inbox.enqueue(input());
    await inbox.markFailed(event!.id, "boom");
    let got = await inbox.get(event!.id);
    expect(got?.status).toBe("FAILED");
    // Failed events are re-claimable.
    const reclaimed = await inbox.claimPending(10);
    expect(reclaimed).toHaveLength(1);
    await inbox.markProcessed(event!.id);
    got = await inbox.get(event!.id);
    expect(got?.status).toBe("PROCESSED");
    expect(got?.processedAt).not.toBeNull();
  });
});
