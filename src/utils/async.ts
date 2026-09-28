import { CircuitOpenError, RateLimitError, TimeoutError } from "./errors";
import { sleep } from "./time";

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation",
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  isRetryable?: (error: unknown) => boolean;
}

const defaultRetryable = (error: unknown): boolean => {
  if (error instanceof RateLimitError) return true;
  if (error instanceof TimeoutError) return true;
  if (typeof error === "object" && error !== null && "retryable" in error) {
    return Boolean((error as { retryable?: boolean }).retryable);
  }
  return false;
};

/** Retry with exponential backoff + jitter. Honors RateLimitError.retryAfterMs. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 250;
  const max = opts.maxDelayMs ?? 8_000;
  const factor = opts.factor ?? 2;
  const jitter = opts.jitter ?? true;
  const isRetryable = opts.isRetryable ?? defaultRetryable;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries || !isRetryable(err)) throw err;
      let delay = Math.min(max, base * Math.pow(factor, attempt - 1));
      if (err instanceof RateLimitError && err.retryAfterMs) {
        delay = Math.max(delay, err.retryAfterMs);
      }
      if (jitter) delay = Math.round(delay * (0.5 + Math.random() * 0.5));
      opts.onRetry?.(attempt, err, delay);
      await sleep(delay);
    }
  }
}

type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  cooldownMs?: number;
  halfOpenMax?: number;
}

/**
 * Minimal circuit breaker. After `failureThreshold` consecutive failures the
 * circuit opens and short-circuits calls for `cooldownMs`, then allows a
 * limited number of trial calls (half-open).
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private openedAt = 0;
  private halfOpenInFlight = 0;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly halfOpenMax: number;

  constructor(opts: CircuitBreakerOptions) {
    this.name = opts.name;
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
    this.halfOpenMax = opts.halfOpenMax ?? 1;
  }

  getState(): CircuitState {
    this.maybeHalfOpen();
    return this.state;
  }

  private maybeHalfOpen(): void {
    if (this.state === "open" && Date.now() - this.openedAt >= this.cooldownMs) {
      this.state = "half-open";
      this.halfOpenInFlight = 0;
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeHalfOpen();
    if (this.state === "open") {
      throw new CircuitOpenError(this.name);
    }
    if (this.state === "half-open" && this.halfOpenInFlight >= this.halfOpenMax) {
      throw new CircuitOpenError(this.name);
    }
    if (this.state === "half-open") this.halfOpenInFlight++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = "closed";
    this.halfOpenInFlight = 0;
  }

  private onFailure(): void {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }
}

/** Run promises with a concurrency cap; preserves input order in the result. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}
