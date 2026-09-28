import type { FullScan } from "./index";

interface CacheEntry {
  at: number;
  scan: FullScan;
}

/**
 * Coalesces concurrent scans for the same token and serves a fresh recent scan
 * instead of re-running providers. If five wallets buy a token within seconds,
 * we run ONE scan and reuse it, updating convergence context separately.
 * (blueprint §32)
 */
export class ScanCoalescer {
  private readonly inFlight = new Map<string, Promise<FullScan>>();
  private readonly recent = new Map<string, CacheEntry>();

  constructor(private readonly freshnessMs: number = 15_000) {}

  /**
   * Run `runner` for `tokenAddress`, deduplicating concurrent callers and
   * reusing a recent result within the freshness window (unless force=true).
   */
  async run(
    tokenAddress: string,
    runner: () => Promise<FullScan>,
    opts: { force?: boolean; now?: number } = {},
  ): Promise<FullScan> {
    const now = opts.now ?? Date.now();

    if (!opts.force) {
      const cached = this.recent.get(tokenAddress);
      if (cached && now - cached.at < this.freshnessMs) {
        return cached.scan;
      }
      const pending = this.inFlight.get(tokenAddress);
      if (pending) return pending;
    }

    const promise = (async () => {
      try {
        const scan = await runner();
        this.recent.set(tokenAddress, { at: Date.now(), scan });
        return scan;
      } finally {
        this.inFlight.delete(tokenAddress);
      }
    })();

    this.inFlight.set(tokenAddress, promise);
    return promise;
  }

  isRunning(tokenAddress: string): boolean {
    return this.inFlight.has(tokenAddress);
  }

  invalidate(tokenAddress: string): void {
    this.recent.delete(tokenAddress);
  }
}
