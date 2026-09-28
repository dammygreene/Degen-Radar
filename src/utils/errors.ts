/** Base class for all typed domain/provider errors. */
export class AppError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(code: string, message: string, opts?: { retryable?: boolean; cause?: unknown }) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.retryable = opts?.retryable ?? false;
    this.cause = opts?.cause;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super("VALIDATION", message, { retryable: false, cause });
  }
}

export class ProviderError extends AppError {
  readonly provider: string;
  readonly status?: number;

  constructor(
    provider: string,
    message: string,
    opts?: { status?: number; retryable?: boolean; cause?: unknown },
  ) {
    super("PROVIDER", message, { retryable: opts?.retryable, cause: opts?.cause });
    this.provider = provider;
    this.status = opts?.status;
  }
}

export class RateLimitError extends ProviderError {
  readonly retryAfterMs?: number;
  constructor(provider: string, retryAfterMs?: number, cause?: unknown) {
    super(provider, `Rate limited by ${provider}`, { status: 429, retryable: true, cause });
    this.retryAfterMs = retryAfterMs;
  }
}

export class TimeoutError extends AppError {
  constructor(message: string) {
    super("TIMEOUT", message, { retryable: true });
  }
}

export class CircuitOpenError extends AppError {
  constructor(name: string) {
    super("CIRCUIT_OPEN", `Circuit breaker open for ${name}`, { retryable: true });
  }
}
