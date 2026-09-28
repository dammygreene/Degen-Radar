import { ProviderError, RateLimitError, TimeoutError } from "../utils/errors";
import { CircuitBreaker, withRetry, withTimeout } from "../utils/async";
import { recordProviderHealth } from "./health";

export interface HttpClientOptions {
  provider: string;
  baseUrl: string;
  timeoutMs?: number;
  defaultHeaders?: Record<string, string>;
  retries?: number;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  method?: string;
  body?: unknown;
  timeoutMs?: number;
}

/**
 * Shared HTTP client with timeout, retry+backoff, rate-limit handling,
 * circuit breaking and provider-health recording. Never leaks credentials.
 */
export class HttpClient {
  private readonly breaker: CircuitBreaker;

  constructor(private readonly opts: HttpClientOptions) {
    this.breaker = new CircuitBreaker({ name: opts.provider, failureThreshold: 5, cooldownMs: 30_000 });
  }

  async getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: options.method ?? "GET" });
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(path.startsWith("http") ? path : `${this.opts.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const timeoutMs = options.timeoutMs ?? this.opts.timeoutMs ?? 10_000;
    const started = Date.now();

    const run = async (): Promise<T> => {
      const res = await withTimeout(
        fetch(url, {
          method: options.method ?? "GET",
          headers: {
            "content-type": "application/json",
            "user-agent": "degen-radar/1.0 (+research)",
            ...this.opts.defaultHeaders,
            ...options.headers,
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
        }),
        timeoutMs,
        `${this.opts.provider} ${path}`,
      );

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        throw new RateLimitError(
          this.opts.provider,
          Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new ProviderError(this.opts.provider, `Auth/plan error (${res.status})`, {
          status: res.status,
          retryable: false,
        });
      }
      if (!res.ok) {
        throw new ProviderError(this.opts.provider, `HTTP ${res.status}`, {
          status: res.status,
          retryable: res.status >= 500,
        });
      }
      return (await res.json()) as T;
    };

    try {
      const result = await this.breaker.execute(() =>
        withRetry(run, {
          retries: this.opts.retries ?? 3,
          onRetry: () => void 0,
        }),
      );
      recordProviderHealth(this.opts.provider, {
        status: "ok",
        latencyMs: Date.now() - started,
      });
      return result;
    } catch (err) {
      const status =
        err instanceof ProviderError ? err.status : err instanceof TimeoutError ? 408 : undefined;
      recordProviderHealth(this.opts.provider, {
        status: err instanceof RateLimitError ? "rate_limited" : "error",
        latencyMs: Date.now() - started,
        errorCode: err instanceof Error ? err.name : "unknown",
        httpStatus: status,
      });
      throw err;
    }
  }
}
