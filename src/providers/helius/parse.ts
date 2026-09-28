import { computeTradeIdempotencyKey } from "../../domain/dedup";
import type { NormalizedTrade } from "../../domain/types";
import { isValidSolanaAddress } from "../../utils/solana-address";
import type {
  HeliusEnhancedTransaction,
  HeliusSwapTokenIO,
} from "./types";

/** Quote assets that are NOT the "traded" memecoin side of a swap. */
export const QUOTE_MINTS = new Set<string>([
  "So11111111111111111111111111111111111111112", // wSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

export interface ParseOptions {
  /** If provided, only classify trades for these wallet addresses. */
  targetWallets?: Set<string> | null;
  /** Marks resulting trades as backfill (they must not auto-alert). */
  backfill?: boolean;
}

const bothArray = (io?: HeliusSwapTokenIO[]): HeliusSwapTokenIO[] => io ?? [];

function tokenAmount(io: HeliusSwapTokenIO): number | null {
  const raw = io.rawTokenAmount;
  if (!raw || raw.tokenAmount == null) return null;
  const n = Number(raw.tokenAmount);
  if (!Number.isFinite(n)) return null;
  const decimals = raw.decimals ?? 0;
  return n / Math.pow(10, decimals);
}

/**
 * Parse a single Helius enhanced transaction into zero or more normalized
 * trades. A BUY/SELL is only produced when there is genuine SWAP evidence:
 *
 *  - `type === "SWAP"` or an `events.swap` block is present, AND
 *  - the wallet is on the memecoin side of the swap (gained non-quote token =>
 *    BUY; spent non-quote token => SELL).
 *
 * Plain token transfers, airdrops, migrations and failed transactions never
 * produce a trade. (blueprint §7)
 */
export function parseHeliusTransaction(
  tx: HeliusEnhancedTransaction,
  opts: ParseOptions = {},
): NormalizedTrade[] {
  if (!tx || typeof tx !== "object") return [];
  // Failed transactions are ignored.
  if (tx.transactionError) return [];

  const swap = tx.events?.swap;
  const isSwap = tx.type === "SWAP" || Boolean(swap);
  if (!isSwap || !swap) return [];

  const signature = tx.signature ?? null;
  const occurredAt = tx.timestamp ? new Date(tx.timestamp * 1000) : new Date();
  const dex = tx.source ?? null;

  const tokenInputs = bothArray(swap.tokenInputs);
  const tokenOutputs = bothArray(swap.tokenOutputs);

  // Determine candidate wallets: swap participants (+ feePayer).
  const participants = new Set<string>();
  for (const io of [...tokenInputs, ...tokenOutputs]) {
    if (io.userAccount && isValidSolanaAddress(io.userAccount)) participants.add(io.userAccount);
  }
  if (tx.feePayer && isValidSolanaAddress(tx.feePayer)) participants.add(tx.feePayer);
  if (swap.nativeInput?.account) participants.add(swap.nativeInput.account);
  if (swap.nativeOutput?.account) participants.add(swap.nativeOutput.account);

  const wallets = opts.targetWallets
    ? [...participants].filter((w) => opts.targetWallets!.has(w))
    : [...participants];

  const trades: NormalizedTrade[] = [];

  for (const wallet of wallets) {
    // Non-quote token the wallet RECEIVED => BUY.
    const gained = tokenOutputs.find(
      (io) => io.userAccount === wallet && io.mint && !QUOTE_MINTS.has(io.mint),
    );
    // Non-quote token the wallet SENT => SELL.
    const spent = tokenInputs.find(
      (io) => io.userAccount === wallet && io.mint && !QUOTE_MINTS.has(io.mint),
    );

    let side: "BUY" | "SELL" | null = null;
    let mint: string | null = null;
    let amountToken: number | null = null;
    let quoteMint: string | null = null;

    if (gained && gained.mint) {
      side = "BUY";
      mint = gained.mint;
      amountToken = tokenAmount(gained);
      quoteMint =
        tokenInputs.find((io) => io.mint && QUOTE_MINTS.has(io.mint))?.mint ??
        (swap.nativeInput ? "So11111111111111111111111111111111111111112" : null);
    } else if (spent && spent.mint) {
      side = "SELL";
      mint = spent.mint;
      amountToken = tokenAmount(spent);
      quoteMint =
        tokenOutputs.find((io) => io.mint && QUOTE_MINTS.has(io.mint))?.mint ??
        (swap.nativeOutput ? "So11111111111111111111111111111111111111112" : null);
    }

    if (!side || !mint || !isValidSolanaAddress(mint)) continue;

    const idempotencyKey = computeTradeIdempotencyKey({
      wallet,
      tokenAddress: mint,
      side,
      occurredAt,
      signature,
      providerEventId: signature,
      source: "helius",
    });

    trades.push({
      wallet,
      tokenAddress: mint,
      side,
      amountToken,
      amountUsd: null, // Helius alone doesn't price the trade; enriched later.
      occurredAt,
      signature,
      providerEventId: signature,
      source: opts.backfill ? "helius-backfill" : "helius",
      idempotencyKey,
      quoteTokenAddress: quoteMint,
      quoteAmount: null,
      dex,
      classifierConfidence: 0.9,
      backfill: opts.backfill ?? false,
    });
  }

  return trades;
}

/**
 * Parse a Helius webhook payload (an array of enhanced transactions) into
 * normalized trades. Non-arrays and malformed entries are skipped safely.
 */
export function parseHeliusWebhook(
  payload: unknown,
  opts: ParseOptions = {},
): NormalizedTrade[] {
  const list = Array.isArray(payload) ? payload : [];
  const out: NormalizedTrade[] = [];
  for (const tx of list) {
    try {
      out.push(...parseHeliusTransaction(tx as HeliusEnhancedTransaction, opts));
    } catch {
      // Never let one malformed tx break the batch.
    }
  }
  return out;
}
