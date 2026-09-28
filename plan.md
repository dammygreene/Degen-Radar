# Degen Radar V1 Implementation Plan

## Phase 0: Repository Audit

Tasks:
- inspect existing repository
- identify framework/runtime
- identify package manager
- inspect existing env/config
- inspect database
- inspect bot code
- inspect tests
- identify reusable modules

Deliverable:
- short `IMPLEMENTATION_NOTES.md`
- no unnecessary rewrites

Acceptance:
- agent understands current repo before editing

## Phase 1: Foundation

Build:
- Fastify app
- grammY bot
- PostgreSQL
- Drizzle
- Redis
- BullMQ
- config validation
- structured logger
- health endpoints

Commands:
- `/start`
- `/help`
- `/status`

Acceptance:
- all services boot locally
- migrations run
- `/status` reports DB/Redis/provider state

## Phase 2: Token Market Data

Build:
- DEX Screener adapter
- token normalization
- pair normalization
- token search
- token lookup
- market snapshots

Implement:
- `/token <address>`
- `/scan`

Acceptance:
- real token data can be retrieved
- provider failures are handled
- no provider response leaks into domain code

## Phase 3: Security + Holders

Build:
- Solana RPC adapter
- security analysis
- holder ingestion
- concentration metrics
- creator analysis

Acceptance:
- scan displays security flags
- critical flags can suppress alerts
- tests cover authority and concentration logic

## Phase 4: Wallet Watchlists

Build:
- watched entities
- wallet validation
- wallet groups
- `/watchwallet`
- `/unwatch`
- `/watchlist`

Build wallet trade ingestion.

Acceptance:
- watched wallet buy can create an internal event
- duplicate buys are ignored
- Telegram confirmation works

## Phase 5: FOMO Integration

Build:
- FOMO adapter
- handle resolution
- trader profiles
- holdings
- trade stream
- token holder lookup
- FOMO watchlist

Commands:
- `/watchfomo`
- `/wallet`

Acceptance:
- FOMO account resolves to Solana wallet
- FOMO buy creates normalized event
- FOMO holder data appears in token scan

## Phase 6: Event-Driven Scan Orchestrator

Build:
- event schemas
- queues
- scan orchestrator
- parallel provider fetching
- scan persistence
- scan signals

Acceptance:
- wallet/FOMO buy automatically triggers scan
- manual scan uses same engine
- scan is idempotent

## Phase 7: Momentum Engine

Build:
- rolling snapshots
- velocity calculations
- buyer growth
- holder growth
- volume acceleration
- liquidity change
- price acceleration

Acceptance:
- every metric includes comparison window
- no division-by-zero errors
- insufficient history is marked instead of guessed

## Phase 8: X Intelligence

Build:
- X provider
- recent post search
- author normalization
- mention aggregation
- engagement aggregation
- acceleration metrics
- narrative extraction from evidence

Acceptance:
- X unavailable does not crash scans
- social snapshot is persisted
- narrative never claims unsupported facts

## Phase 9: Wallet Intelligence + Convergence

Build:
- wallet profiles
- wallet relationships
- FOMO holders
- watched entity activity
- cluster-adjusted convergence
- convergence events

Acceptance:
- two independent watched wallets produce convergence
- same wallet represented by FOMO + raw address is counted once
- clustered wallets are not falsely treated as independent

## Phase 10: Scoring

Build:
- deterministic category scorers
- confidence engine
- reason generation
- alert qualification

Acceptance:
- every point is explainable
- score unit tests cover edge cases
- confidence reflects missing/stale data

## Phase 11: Alert Engine

Build:
- alert templates
- Telegram delivery
- cooldown
- aggregation
- per-user settings
- alert history

Acceptance:
- no duplicate spam
- convergence alert aggregates entries
- score threshold works

## Phase 12: Outcome Tracking

Build:
- scheduled snapshots
- +15m through +7d
- peak calculations
- drawdown
- survival status

Acceptance:
- jobs survive process restart
- snapshots are idempotent
- outcome calculations are reproducible

## Phase 13: Hardening

Tasks:
- provider retry
- rate-limit handling
- circuit breakers
- database indexes
- queue retry policy
- logging
- metrics
- security audit
- integration tests
- load test

## Phase 14: Deployment

Preferred:
- managed PostgreSQL
- managed Redis
- Node service
- worker service
- environment secrets
- Telegram webhook or long polling based on deployment constraints

Final checks:
- no secrets in Git
- migrations reproducible
- bot restarts cleanly
- worker restarts cleanly
- provider outages degrade gracefully

## Build order rule

Do not skip directly to polished Telegram UX.

The priority is:

data -> events -> scans -> scoring -> alerts -> historical feedback -> polish
