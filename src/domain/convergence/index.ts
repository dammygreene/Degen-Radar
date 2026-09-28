import { MINUTE } from "../../utils/time";

/** One observed entry from a watched entity into a token. */
export interface ConvergenceEntry {
  entityId: string;
  entityType: "wallet" | "fomo";
  /** The underlying resolved Solana wallet, if known. */
  wallet: string | null;
  /** Cluster identifier; entries sharing a cluster are not independent. */
  clusterId: string | null;
  enteredAt: Date;
  amountUsd: number | null;
}

export interface ConvergenceResult {
  /** Raw number of watched-entity entries in window (may double-count identity). */
  entityCount: number;
  /** Distinct underlying wallets. */
  uniqueWalletCount: number;
  /** How many entries were FOMO-typed. */
  fomoCount: number;
  /** Independent identities after collapsing duplicate representations. */
  independentEntities: number;
  /** Independent identities after also collapsing shared clusters. */
  clusterAdjustedCount: number;
  isConvergence: boolean;
  isStrong: boolean;
  firstEntryAt: Date | null;
  lastEntryAt: Date | null;
  totalUsd: number;
  windowSeconds: number;
}

export interface ConvergenceOptions {
  windowSeconds?: number;
  minEntities?: number;
  strongEntities?: number;
  now?: Date;
}

/**
 * Analyze whether multiple *independent* watched entities entered a token
 * inside a window.
 *
 * Identity collapsing rules (blueprint §8):
 *  1. A raw wallet and a FOMO handle that resolve to the SAME wallet are ONE
 *     underlying entity.
 *  2. Entities in the same cluster are not counted as independent.
 *  3. Entities without a resolved wallet fall back to their entityId identity.
 */
export function analyzeConvergence(
  entries: readonly ConvergenceEntry[],
  opts: ConvergenceOptions = {},
): ConvergenceResult {
  const windowSeconds = opts.windowSeconds ?? 15 * 60;
  const minEntities = opts.minEntities ?? 2;
  const strongEntities = opts.strongEntities ?? 3;
  const now = opts.now ?? new Date();
  const windowStart = now.getTime() - windowSeconds * 1000;

  const inWindow = entries.filter((e) => e.enteredAt.getTime() >= windowStart);

  if (inWindow.length === 0) {
    return {
      entityCount: 0,
      uniqueWalletCount: 0,
      fomoCount: 0,
      independentEntities: 0,
      clusterAdjustedCount: 0,
      isConvergence: false,
      isStrong: false,
      firstEntryAt: null,
      lastEntryAt: null,
      totalUsd: 0,
      windowSeconds,
    };
  }

  // Identity key: prefer wallet; otherwise fall back to entityId.
  const identityKey = (e: ConvergenceEntry): string =>
    e.wallet ? `w:${e.wallet}` : `e:${e.entityId}`;

  const identities = new Set<string>();
  const wallets = new Set<string>();
  let fomoCount = 0;
  let totalUsd = 0;
  let firstEntryAt = inWindow[0]!.enteredAt;
  let lastEntryAt = inWindow[0]!.enteredAt;

  for (const e of inWindow) {
    identities.add(identityKey(e));
    if (e.wallet) wallets.add(e.wallet);
    if (e.entityType === "fomo") fomoCount++;
    totalUsd += e.amountUsd ?? 0;
    if (e.enteredAt < firstEntryAt) firstEntryAt = e.enteredAt;
    if (e.enteredAt > lastEntryAt) lastEntryAt = e.enteredAt;
  }

  const independentEntities = identities.size;

  // Cluster adjustment: collapse independent identities that share a cluster.
  // Identities with no cluster remain individually independent.
  const clusterBuckets = new Set<string>();
  const clusterSeen = new Set<string>();
  // Map identity -> its cluster (first cluster observed for that identity).
  const identityCluster = new Map<string, string | null>();
  for (const e of inWindow) {
    const id = identityKey(e);
    if (!identityCluster.has(id)) identityCluster.set(id, e.clusterId ?? null);
  }
  for (const [id, cluster] of identityCluster) {
    if (cluster) {
      if (!clusterSeen.has(cluster)) {
        clusterSeen.add(cluster);
        clusterBuckets.add(`cluster:${cluster}`);
      }
    } else {
      clusterBuckets.add(`solo:${id}`);
    }
  }
  const clusterAdjustedCount = clusterBuckets.size;

  return {
    entityCount: inWindow.length,
    uniqueWalletCount: wallets.size,
    fomoCount,
    independentEntities,
    clusterAdjustedCount,
    isConvergence: clusterAdjustedCount >= minEntities,
    isStrong: clusterAdjustedCount >= strongEntities,
    firstEntryAt,
    lastEntryAt,
    totalUsd,
    windowSeconds,
  };
}

export const DEFAULT_CONVERGENCE_WINDOW_MS = 15 * MINUTE;
