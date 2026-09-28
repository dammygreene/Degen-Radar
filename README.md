# Degen Radar V1

Degen Radar is an event-driven Telegram intelligence terminal for low-cap Solana memecoins.

It watches:
- the Solana market
- user-defined Solana wallets
- FOMO trader accounts
- market momentum
- on-chain structure and security
- X narrative activity

When a watched wallet or FOMO trader buys a token, Degen Radar automatically scans the token. It only notifies the user when the configured evidence threshold is met.

It also detects convergence when multiple watched wallets/FOMO traders enter the same token in a short window.

> **Research-only.** V1 does NOT execute trades, store private keys, sign transactions, or provide copy trading.

---

## What's in this repo

This repository contains **both** the design spec and a working TypeScript
implementation of it.

**Implementation** (see `IMPLEMENTATION_NOTES.md` for the full audit + map):

- `src/` — the application (Fastify API, grammY bot, BullMQ workers, Drizzle
  schema, provider adapters, and the deterministic scoring/convergence engine)
- `tests/` — 65 unit tests for the deterministic core
- `docker-compose.yml` — local PostgreSQL + Redis
- `env.example` — configuration reference

**Spec** (the original design docs):

- `blueprint.md` – complete technical/product architecture
- `build-prompt.md` – master prompt for the coding agent
- `plan.md` – implementation phases and acceptance criteria
- `architecture.md` – services, queues, events and data flow
- `data-model.md` – PostgreSQL schema and relationships
- `scoring.md` – deterministic scoring engine
- `integrations.md` – provider adapters and API notes
- `telegram.md` – bot commands, screens and alerts
- `testing.md` – testing strategy and definition of done

---

## Quick start

### 1. Install

```bash
npm install
cp env.example .env      # then fill in secrets as needed
```

### 2. Run the tests (no infrastructure required)

```bash
npm test          # 65 unit tests for scoring, confidence, momentum,
                  # convergence, dedup, qualification, cooldown, outcomes…
npm run typecheck
npm run lint
```

### 3. Try it with zero setup (mock providers, degraded mode)

The app boots even without a database, Redis, or API keys:

```bash
USE_MOCK_PROVIDERS=true npm run api
# then, in another shell:
curl localhost:3000/health
curl localhost:3000/scan/So11111111111111111111111111111111111111112
```

`USE_MOCK_PROVIDERS` swaps in deterministic in-repo fixtures so you can exercise
the full scan → score → confidence pipeline offline. **Never enable it in
production.**

### 4. Run the full stack

```bash
docker compose up -d          # PostgreSQL + Redis
# set DATABASE_URL, REDIS_URL, TELEGRAM_BOT_TOKEN, SOLANA_RPC_URL in .env
npm run db:generate           # generate SQL migrations from the Drizzle schema
npm run db:migrate            # apply them
npm run dev                   # all-in-one (API + workers + bot)
```

Or run the processes separately (recommended for production):

```bash
npm run api      # Fastify HTTP API
npm run worker   # BullMQ workers
npm run bot      # Telegram bot (long polling)
```

### 5. Production build

```bash
npm run build    # tsc -> dist/
npm start        # node dist/main.js
```

---

## Telegram commands

```
/start                     intro
/help                      command list
/token <address>           full deterministic token scan
/scan                      qualifying candidates
/watchwallet <address>     watch a Solana wallet
/watchfomo <handle>        watch a FOMO trader (resolves to a wallet)
/unwatch <address|handle>  stop watching
/watchlist                 show your watchlist
/settings                  alert thresholds
/status                    system + provider health
```

## HTTP API

```
GET /            service info
GET /health      DB / Redis / provider health
GET /ready       readiness probe
GET /providers   provider health snapshots
GET /scan/:addr  read-only deterministic scan of a Solana token
```

## Scoring (100 pts, deterministic & explainable)

| Category            | Max |
|---------------------|-----|
| Security / Structure| 25  |
| Demand              | 20  |
| Liquidity           | 15  |
| Holder Growth       | 15  |
| Wallet Intelligence | 10  |
| Momentum            | 10  |
| X / Narrative       | 5   |

Confidence is scored **separately** and reflects evidence completeness/quality,
not token quality. Every category emits an evidence-grounded reason — never a
bare number. A score means *research priority*, not a trading instruction.
