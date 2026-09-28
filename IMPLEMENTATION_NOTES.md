# Implementation Notes

This document is the Phase 0 audit + implementation record for Degen Radar V1.

## Repository audit (before build)

The repository was **spec-only**: a set of markdown documents (`blueprint.md`,
`build-prompt.md`, `architecture.md`, `data-model.md`, `scoring.md`,
`integrations.md`, `telegram.md`, `plan.md`, `agent-checklist.md`,
`testing.md`) plus `env.example`. There was **no existing code, framework,
package manager, database, bot, or tests** to preserve. The build therefore
starts a fresh TypeScript project using the stack the spec prefers.

## Stack chosen (per `build-prompt.md`)

- **TypeScript / Node 20+** (compiled to CommonJS for robust `node dist` runs)
- **Fastify** — HTTP API (`/health`, `/ready`, `/providers`, `/scan/:address`)
- **grammY** — Telegram bot
- **PostgreSQL + Drizzle ORM** — persistence (full schema in `src/db/schema.ts`)
- **Redis + BullMQ** — queues / durable jobs
- **Zod** — config validation
- **pino** — structured, secret-redacting logging
- **Vitest** — unit tests
- **@solana/web3.js** — real Solana RPC adapter (mint/freeze authority)

## Architecture (matches `architecture.md`)

```
src/
  config/       validated env + app config (Zod)
  utils/        logger, errors, time, async (retry/timeout/circuit breaker),
                solana-address validation, formatting
  domain/       PURE, provider-free business logic
    types.ts    normalized domain types
    scoring/    7 deterministic category scorers + confidence + radar aggregate
    momentum/   snapshot velocity metrics
    convergence/ identity-collapsing + cluster-adjusted convergence
    dedup/      trade idempotency keys + TTL dedup cache
    alerts/     qualification, cooldown/anti-spam, Telegram templates
    users/      user settings
    scans/      scan bundle + result types
  events/       typed event envelopes
  providers/    interfaces + adapters (real DEX Screener, real Solana RPC,
                deterministic dev mocks for FOMO/X/Birdeye), health tracking,
                shared HTTP client
  queues/       BullMQ queues, Redis connection, workers
  db/           Drizzle schema, client, migrate
  services/     scan-orchestrator, wallet-monitor, x-intelligence,
                outcome-tracker, users, watchlist, health
  bot/          grammY bot + commands
  app/          Fastify server
  entrypoints/  api.ts, bot.ts, worker.ts
  main.ts       all-in-one entrypoint
```

**Provider rule enforced:** domain code imports only `src/domain/**` types;
adapters map external responses into those types. External response shapes
never leak past the adapter boundary.

## Deterministic core (the priority per `plan.md` build order)

`data → events → scans → scoring → alerts → historical → polish`

The scoring, confidence, momentum, convergence, dedup, qualification, cooldown,
outcome and X-aggregation logic are all **pure functions** with **65 unit
tests** (`npm test`). This includes all convergence cases (A–D) from
`testing.md` (independent wallets, wallet+FOMO identity collapse, cluster
adjustment, strong convergence).

## Graceful degradation (per `blueprint.md` §14)

The system boots and serves even when infrastructure/credentials are absent:

- No `DATABASE_URL` → persistence disabled, `/health` reports `db:false`.
- No `REDIS_URL` → queues/workers disabled (degraded mode), reported in health.
- No `SOLANA_RPC_URL` → dev chain adapter used (confidence lowered).
- Missing `FOMO_API_KEY` / `X_BEARER_TOKEN` → those providers disabled;
  scans still complete with reduced confidence and recorded `missingSources`.
- `USE_MOCK_PROVIDERS=true` → deterministic in-repo fixtures for a runnable
  offline demo. **Never enable in production.**

A single provider failure never fails a scan — confidence drops and the missing
source is surfaced.

## Security posture (per `blueprint.md` §13)

- No private keys, seed phrases, signing, or trade-execution code exists.
- Provider secrets are read only through `src/config/env.ts` and redacted in logs.
- Every Solana address is validated (base58 + 32-byte length).
- Telegram user IDs are the per-user authorization boundary (watchlists scoped
  by `user_id`).

## What is real vs. stubbed in V1

| Provider        | Status in this build |
|-----------------|----------------------|
| DEX Screener    | **Real** HTTP adapter (no key needed) |
| Solana RPC      | **Real** mint/freeze authority via `getParsedAccountInfo`; holder distribution + creator analysis require an indexer and are marked `unavailable`/`partial` (lower confidence) rather than fabricated |
| Helius          | **Real** adapter + parser — indexed webhook events (`POST /webhooks/helius`), parsed-history backfill, and a safety-first swap classifier |
| FOMO            | **Real** HTTP adapter + WebSocket realtime manager (independent/unofficial fomo.family data layer) |
| X               | **Real** Recent Search adapter + query builder + acceleration windows |
| Birdeye         | Interface + deterministic dev adapter (supplementary, off the critical path) |

All adapters return `null` (not fabricated data) and lower scan confidence when
their credentials are absent. `USE_MOCK_PROVIDERS=true` is the only path to
deterministic fixtures and is dev-only. See `PROVIDER_STATUS.md` for per-provider
detail and `TEST_REPORT.md` for coverage.

## Milestone 2 — production integration + live event pipeline

- **Durable idempotency:** a Postgres `event_inbox` with a unique
  `(provider, idempotency_key)` constraint is the authoritative dedup layer
  (`ON CONFLICT DO NOTHING`). BullMQ `jobId` provides a cheap first-line dedup;
  the inbox is the source of truth. An in-memory implementation backs offline tests.
- **Event pipeline:** `src/pipeline/process-trade.ts` is a pure orchestrator
  (injected deps) — inbox dedup → ignore SELL → resolve entity → record entry +
  analyze convergence → pick scan priority → **coalesced** scan → qualification →
  per-user cooldown gate → deliver → schedule outcome checkpoints. Statuses:
  `duplicate | unwatched | ignored_side | backfilled | processed`.
- **Scan coalescing:** `ScanCoalescer` de-duplicates concurrent per-token scans and
  reuses a fresh result within a 15s window (blueprint §concurrency).
- **Ingress:** `POST /webhooks/helius` fast-acks after constant-time secret
  verification and enqueues to `chain-events`; the FOMO WS manager feeds the same
  queue. Workers rehydrate `occurredAt` and run the pipeline.
- **Persistence:** scans/signals, alerts, wallet trades, watched entities and
  outcome snapshots are written through Drizzle repos (`services/*`), all behind
  interfaces so the e2e tests run fully in-memory.
- **Read API:** `/watchlist/:id`, `/wallets/:address`, `/tokens/:address`,
  `/alerts/:id` (503 in degraded mode without a DB).

## Follow-ups to reach full production

- Provision Helius webhooks automatically (store webhook id) and confirm live
  FOMO WS payload field names against a credentialed feed.
- A Solana indexer integration for holder concentration + creator analysis.
- Run `npm run db:generate` + `db:migrate` against a live Postgres and validate
  BullMQ against a live Redis (blocked here — no infra/credentials).
- Optional: a real Birdeye adapter behind the existing `WalletIntelProvider`.
