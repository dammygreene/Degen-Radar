# Test Report

Generated for the production-integration + live-event-pipeline milestone.

## Toolchain gates (all green)

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | ✅ exit 0 |
| Lint | `npx eslint "src/**/*.ts"` | ✅ exit 0 |
| Unit/integration tests | `npx vitest run` | ✅ **114 passed / 21 files** |
| Production build | `npx tsc -p tsconfig.build.json` | ✅ exit 0 |
| Runtime smoke | `node dist/entrypoints/api.js` (mock providers) | ✅ boots, webhook + read routes respond |

## Test files (21)

| File | Focus |
| --- | --- |
| `address.test.ts` | Solana address validation boundary |
| `scoring.test.ts` | Deterministic 100-pt scoring + human-readable reasons |
| `confidence.test.ts` | Confidence penalties for missing/stale data |
| `qualify.test.ts` | Alert qualification thresholds (score/confidence/critical/liquidity) |
| `convergence.test.ts` | Multi-entity convergence cases (cluster de-dup, strong ≥3) |
| `cooldown.test.ts` | Per-token + per-user anti-spam windows |
| `momentum.test.ts` | Momentum/acceleration scoring |
| `social.test.ts` | Social snapshot scoring |
| `outcome.test.ts` | Outcome checkpoint schedule builder |
| `dedup.test.ts` | Idempotency-key construction |
| `ingest.test.ts` | Trade ingest / entity resolution shapes |
| `format.test.ts` | Number/age formatting for alerts |
| **`helius.test.ts`** | **NEW** — swap classification (BUY/SELL vs transfers, failed tx, backfill flag, target-wallet filter, stable idempotency keys, webhook batch) |
| **`event-inbox.test.ts`** | **NEW** — durable dedup on `(provider, idempotencyKey)`, claim/attempt-count, processed/failed/retry lifecycle |
| **`coalesce.test.ts`** | **NEW** — concurrent per-token scan de-dup + fresh-result reuse + force |
| **`priority.test.ts`** | **NEW** — scan priority mapping + queue weight ordering |
| **`x-query.test.ts`** | **NEW** — X query builder (variants, contract, ambiguous symbols, dedupe) |
| **`x-windows.test.ts`** | **NEW** — window stats + acceleration states (no Infinity) |
| **`fomo-realtime.test.ts`** | **NEW** — WS manager subscribe/restore/reconnect + realtime trade normalization (injected fake socket) |
| **`webhook-auth.test.ts`** | **NEW** — Helius webhook secret verification (constant-time, dev bypass) |
| **`pipeline.e2e.test.ts`** | **NEW** — full trade → scan → qualify → alert pipeline with in-memory deps |

## End-to-end pipeline coverage (`pipeline.e2e.test.ts`)

Runs the real `processTradeEvent` orchestrator with an in-memory inbox and injected
deps (no DB/Redis/network). Verified behaviors:

- Watched-wallet BUY → scan → qualify → **exactly one** alert + outcomes scheduled.
- Duplicate event (same idempotency key) → **no second alert** (`status: duplicate`).
- Unwatched wallet → no scan/alert (`status: unwatched`).
- Backfill trade → establishes context, **never auto-alerts** (`status: backfilled`).
- Low score → processed but **no alert**.
- Three independent entities in the window → **CONVERGENCE**, cluster-adjusted count 3 (strong).
- A wallet + a FOMO account that resolve to the **same** wallet → counted once (`uniqueWalletCount: 1`, not a convergence).

## Runtime smoke test (degraded mode, `USE_MOCK_PROVIDERS=true`, no Redis/PG)

- `POST /webhooks/helius` with a real SWAP payload → `{"received":1,"accepted":0}`
  (parsed 1 buy; `accepted:0` because queues are disabled without Redis — expected).
- `POST /webhooks/helius` with a plain TRANSFER → `{"received":0,...}` (correctly not a trade).
- `GET /providers` responds; server logs the explicit degraded-mode warning instead of crashing.

## Not run here (credential/infra-blocked)

No provider credentials and no live Postgres/Redis/Docker were available in the
build environment, so the following are **implemented but not exercised live**:

- Live Helius webhook/backfill, FOMO WebSocket feed, X Recent Search calls.
- Drizzle migrations against real Postgres and BullMQ against real Redis.

These paths are isolated behind interfaces and covered structurally by fixture and
in-memory tests; they require credentials + `docker compose up` to validate live.
See `PROVIDER_STATUS.md`.
