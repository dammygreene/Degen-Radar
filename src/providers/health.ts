export type ProviderStatus = "ok" | "error" | "rate_limited" | "unavailable";

export interface ProviderHealthSample {
  status: ProviderStatus;
  latencyMs: number;
  errorCode?: string;
  httpStatus?: number;
  rateLimitRemaining?: number;
}

export interface ProviderHealthSnapshot extends ProviderHealthSample {
  provider: string;
  capturedAt: Date;
  errorRate: number;
  calls: number;
}

interface Counter {
  calls: number;
  errors: number;
  last?: ProviderHealthSample;
  lastAt?: Date;
}

const registry = new Map<string, Counter>();

/** Record an observation for a provider; kept in-memory + optionally persisted. */
export function recordProviderHealth(provider: string, sample: ProviderHealthSample): void {
  const c = registry.get(provider) ?? { calls: 0, errors: 0 };
  c.calls++;
  if (sample.status !== "ok") c.errors++;
  c.last = sample;
  c.lastAt = new Date();
  registry.set(provider, c);
}

export function getProviderHealth(provider: string): ProviderHealthSnapshot | null {
  const c = registry.get(provider);
  if (!c || !c.last) return null;
  return {
    provider,
    capturedAt: c.lastAt ?? new Date(),
    calls: c.calls,
    errorRate: c.calls > 0 ? c.errors / c.calls : 0,
    ...c.last,
  };
}

export function getAllProviderHealth(): ProviderHealthSnapshot[] {
  return [...registry.keys()]
    .map((p) => getProviderHealth(p))
    .filter((s): s is ProviderHealthSnapshot => s !== null);
}

export function resetProviderHealth(): void {
  registry.clear();
}
