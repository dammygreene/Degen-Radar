import { Connection, PublicKey } from "@solana/web3.js";
import type { HolderData, NormalizedTrade, RiskFlag, TokenSecurityData } from "../../domain/types";
import { withRetry, withTimeout } from "../../utils/async";
import { logger } from "../../utils/logger";
import { recordProviderHealth } from "../health";
import type { ChainProvider } from "../types";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/**
 * Real Solana RPC adapter. Authority/mint metadata is fetched directly from the
 * chain (needs only an RPC URL). Holder concentration and per-wallet trade
 * history require an indexer; when unavailable they are marked `unavailable`
 * (which lowers confidence) rather than fabricated.
 */
export class SolanaChainAdapter implements ChainProvider {
  readonly name = "solana";
  private readonly conn: Connection;

  constructor(rpcUrl: string) {
    this.conn = new Connection(rpcUrl, "confirmed");
  }

  async getTokenSecurity(address: string): Promise<TokenSecurityData> {
    const started = Date.now();
    try {
      const mint = new PublicKey(address);
      const info = await withRetry(
        () => withTimeout(this.conn.getParsedAccountInfo(mint), 10_000, "solana getParsedAccountInfo"),
        { retries: 2 },
      );
      recordProviderHealth(this.name, { status: "ok", latencyMs: Date.now() - started });

      const value = info.value;
      const flags: RiskFlag[] = [];
      let mintAuthority: string | null = null;
      let freezeAuthority: string | null = null;
      let tokenProgram: string | null = null;
      let decimals: number | null = null;

      if (value && "parsed" in value.data) {
        const parsed = value.data.parsed as {
          type: string;
          info: { mintAuthority?: string | null; freezeAuthority?: string | null; decimals?: number };
        };
        tokenProgram = value.owner.toBase58();
        mintAuthority = parsed.info.mintAuthority ?? null;
        freezeAuthority = parsed.info.freezeAuthority ?? null;
        decimals = parsed.info.decimals ?? null;
      } else {
        flags.push({ code: "NO_MINT_DATA", severity: "warn", message: "Mint account not parseable" });
      }

      const isToken2022 = tokenProgram === TOKEN_2022_PROGRAM;

      return {
        token: { chain: "solana", address, symbol: null, name: null, decimals },
        mintAuthority,
        freezeAuthority,
        tokenProgram: tokenProgram ?? TOKEN_PROGRAM,
        token2022Extensions: isToken2022 ? ["token-2022"] : [],
        creatorAddress: null,
        creatorBalancePct: null,
        creatorRecentSellPct: null,
        top10Pct: null,
        top20Pct: null,
        suspiciousClusterScore: null,
        bundledLaunch: null,
        liquidityChangePct: null,
        riskFlags: flags,
        observedAt: new Date(),
        source: this.name,
        // Concentration/creator require an indexer we don't have here.
        status: "partial",
      };
    } catch (err) {
      recordProviderHealth(this.name, {
        status: "error",
        latencyMs: Date.now() - started,
        errorCode: err instanceof Error ? err.name : "unknown",
      });
      logger.warn({ err, address }, "Solana getTokenSecurity failed");
      return {
        token: { chain: "solana", address, symbol: null, name: null, decimals: null },
        mintAuthority: null,
        freezeAuthority: null,
        tokenProgram: null,
        token2022Extensions: [],
        creatorAddress: null,
        creatorBalancePct: null,
        creatorRecentSellPct: null,
        top10Pct: null,
        top20Pct: null,
        suspiciousClusterScore: null,
        bundledLaunch: null,
        liquidityChangePct: null,
        riskFlags: [],
        observedAt: new Date(),
        source: this.name,
        status: "unavailable",
      };
    }
  }

  async getHolders(address: string): Promise<HolderData> {
    // Holder distribution requires an indexer (Helius/Birdeye/etc.).
    return {
      token: { chain: "solana", address, symbol: null, name: null, decimals: null },
      holderCount: null,
      top10Pct: null,
      top20Pct: null,
      topHolderPct: null,
      observedAt: new Date(),
      source: this.name,
      status: "unavailable",
    };
  }

  async getWalletTrades(_address: string, _since?: Date): Promise<NormalizedTrade[]> {
    // Full swap parsing requires an indexer / geyser stream; handled by the
    // wallet-monitor service in production. Returns empty here.
    return [];
  }
}
