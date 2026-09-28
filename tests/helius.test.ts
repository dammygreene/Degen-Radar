import { describe, expect, it } from "vitest";
import { parseHeliusTransaction, parseHeliusWebhook } from "../src/providers/helius/parse";
import type { HeliusEnhancedTransaction } from "../src/providers/helius/types";

const WALLET = "So11111111111111111111111111111111111111112"; // valid base58 32-byte
const WALLET2 = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
// Use a distinct valid address for a non-quote memecoin mint.
const NONQUOTE_MINT = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";

function swapBuyTx(): HeliusEnhancedTransaction {
  return {
    signature: "SIG_BUY_1",
    timestamp: 1_760_000_000,
    type: "SWAP",
    source: "RAYDIUM",
    feePayer: WALLET,
    transactionError: null,
    events: {
      swap: {
        nativeInput: { account: WALLET, amount: "1000000000" },
        tokenOutputs: [
          {
            userAccount: WALLET,
            mint: NONQUOTE_MINT,
            rawTokenAmount: { tokenAmount: "1000000000", decimals: 6 },
          },
        ],
      },
    },
  };
}

describe("Helius swap parsing", () => {
  it("classifies a genuine SWAP where the wallet gains a non-quote token as BUY", () => {
    const trades = parseHeliusTransaction(swapBuyTx());
    expect(trades).toHaveLength(1);
    const t = trades[0]!;
    expect(t.side).toBe("BUY");
    expect(t.tokenAddress).toBe(NONQUOTE_MINT);
    expect(t.wallet).toBe(WALLET);
    expect(t.source).toBe("helius");
    expect(t.amountToken).toBeCloseTo(1000, 5);
    expect(t.signature).toBe("SIG_BUY_1");
    expect(t.idempotencyKey).toContain("sig:SIG_BUY_1");
  });

  it("classifies a SWAP where the wallet spends a non-quote token as SELL", () => {
    const tx: HeliusEnhancedTransaction = {
      signature: "SIG_SELL_1",
      timestamp: 1_760_000_500,
      type: "SWAP",
      source: "JUPITER",
      feePayer: WALLET,
      events: {
        swap: {
          nativeOutput: { account: WALLET, amount: "500000000" },
          tokenInputs: [
            {
              userAccount: WALLET,
              mint: NONQUOTE_MINT,
              rawTokenAmount: { tokenAmount: "2000000", decimals: 6 },
            },
          ],
        },
      },
    };
    const trades = parseHeliusTransaction(tx);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.side).toBe("SELL");
  });

  it("does NOT classify a plain token transfer as a trade", () => {
    const tx: HeliusEnhancedTransaction = {
      signature: "SIG_XFER",
      timestamp: 1_760_000_600,
      type: "TRANSFER",
      feePayer: WALLET,
      tokenTransfers: [
        { fromUserAccount: WALLET2, toUserAccount: WALLET, mint: NONQUOTE_MINT, tokenAmount: 100 },
      ],
    };
    expect(parseHeliusTransaction(tx)).toHaveLength(0);
  });

  it("ignores failed transactions", () => {
    const tx = swapBuyTx();
    tx.transactionError = { InstructionError: [0, "Custom"] };
    expect(parseHeliusTransaction(tx)).toHaveLength(0);
  });

  it("ignores malformed / empty input safely", () => {
    expect(parseHeliusTransaction({} as HeliusEnhancedTransaction)).toHaveLength(0);
    expect(parseHeliusTransaction(null as unknown as HeliusEnhancedTransaction)).toHaveLength(0);
    expect(parseHeliusWebhook("not-an-array")).toHaveLength(0);
    expect(parseHeliusWebhook([null, 42, {}])).toHaveLength(0);
  });

  it("filters to target wallets when provided", () => {
    const trades = parseHeliusTransaction(swapBuyTx(), {
      targetWallets: new Set([NONQUOTE_MINT]), // not the wallet -> excluded
    });
    expect(trades).toHaveLength(0);
    const kept = parseHeliusTransaction(swapBuyTx(), { targetWallets: new Set([WALLET]) });
    expect(kept).toHaveLength(1);
  });

  it("produces stable idempotency keys for the same event (dedup)", () => {
    const a = parseHeliusTransaction(swapBuyTx())[0]!;
    const b = parseHeliusTransaction(swapBuyTx())[0]!;
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
  });

  it("marks backfill trades so they never auto-alert", () => {
    const trades = parseHeliusTransaction(swapBuyTx(), { backfill: true });
    expect(trades[0]!.backfill).toBe(true);
    expect(trades[0]!.source).toBe("helius-backfill");
  });

  it("parses a webhook batch of multiple transactions", () => {
    const batch = [swapBuyTx(), swapBuyTx()];
    // Same tx twice -> same idempotency key, but parser returns both; dedup is
    // enforced downstream by the inbox. Here we just verify parsing count.
    const trades = parseHeliusWebhook(batch);
    expect(trades.length).toBe(2);
  });
});
