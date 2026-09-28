/**
 * Minimal internal shapes for Helius "enhanced"/parsed transactions.
 * Kept inside the provider boundary — never imported by domain code.
 * See https://docs.helius.dev (Enhanced Transactions / Parsed History).
 */
export interface HeliusRawTokenAmount {
  tokenAmount: string;
  decimals: number;
}

export interface HeliusTokenTransfer {
  fromUserAccount?: string;
  toUserAccount?: string;
  fromTokenAccount?: string;
  toTokenAccount?: string;
  mint?: string;
  tokenAmount?: number;
}

export interface HeliusSwapTokenIO {
  userAccount?: string;
  tokenAccount?: string;
  mint?: string;
  rawTokenAmount?: HeliusRawTokenAmount;
}

export interface HeliusNativeIO {
  account?: string;
  amount?: string | number;
}

export interface HeliusSwapEvent {
  nativeInput?: HeliusNativeIO | null;
  nativeOutput?: HeliusNativeIO | null;
  tokenInputs?: HeliusSwapTokenIO[];
  tokenOutputs?: HeliusSwapTokenIO[];
}

export interface HeliusEnhancedTransaction {
  signature?: string;
  timestamp?: number; // seconds
  type?: string; // e.g. "SWAP", "TRANSFER"
  source?: string; // e.g. "RAYDIUM", "JUPITER", "PUMP_FUN"
  feePayer?: string;
  transactionError?: unknown | null;
  tokenTransfers?: HeliusTokenTransfer[];
  events?: {
    swap?: HeliusSwapEvent;
  };
}
