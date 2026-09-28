# Degen Radar V1 Technical Blueprint

## 1. Product Definition

Degen Radar is a Telegram-based Solana memecoin research engine.

Primary job:

1. Discover low-cap Solana tokens.
2. Monitor watched wallets and FOMO traders.
3. Detect buys from watched entities.
4. Automatically scan the affected token.
5. Combine market, security, on-chain, wallet and X intelligence.
6. Detect independent multi-wallet/FOMO convergence.
7. Score the token and confidence.
8. Notify Telegram when configured thresholds are met.
9. Continuously track tokens after detection.
10. Store historical outcomes so the system can be evaluated and improved.

Degen Radar is an intelligence/research system, not an execution system.

## 2. V1 Scope

### Included

- Solana
- Telegram bot
- Low-cap discovery
- Token scanning
- Security/structure checks
- Market/momentum checks
- Holder analysis
- Creator analysis
- Wallet watchlists
- FOMO account watchlists
- Wallet/FOMO convergence
- Wallet clustering
- X narrative intelligence
- Radar score
- Confidence score
- Historical snapshots
- Outcome tracking
- Alerts
- User settings
- Watchlist groups
- Provider health monitoring
- API usage/rate-limit handling
- Persistent PostgreSQL storage
- Background jobs
- Redis queue/cache

### Explicitly excluded

- Auto-buy
- Auto-sell
- Copy trading
- Sniping
- Private key storage
- Wallet signing
- Leverage
- Trade execution
- Multi-chain support
- Paid subscriptions
- Full web dashboard
- ML-based scoring

## 3. Default Market Universe

Default:
- chain: Solana
- minimum MC: $10,000
- maximum MC: $70,000
- minimum liquidity: configurable, default $8,000
- maximum token age: configurable
- quote currencies: primarily SOL/USDC/USDT where available

Do not assume market cap is equivalent to liquidity.

Use the best available token/pair data and record its timestamp.

## 4. System Architecture

```text
                    ┌──────────────────────┐
                    │      Telegram        │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     Bot Gateway      │
                    │       grammY         │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │      Radar API       │
                    │       Fastify        │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       Discovery         Event Ingestion    User Config
              │                │
              └────────────────┼────────────────┐
                               ▼                │
                    ┌──────────────────────┐    │
                    │    Event Bus / Queue │    │
                    │ Redis + BullMQ       │    │
                    └──────────┬───────────┘    │
                               ▼                │
                    ┌──────────────────────┐    │
                    │    Scan Orchestrator │    │
                    └──────────┬───────────┘    │
                               │                │
       ┌───────────────────────┼────────────────┤
       ▼                       ▼                ▼
 Market/Security          Wallet Intel       X Intel
       │                       │                │
       └───────────────────────┼────────────────┘
                               ▼
                    ┌──────────────────────┐
                    │    Radar Scoring     │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │   Alert Orchestrator │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │      Telegram        │
                    └──────────────────────┘

All persistent state:
PostgreSQL

All short-lived state:
Redis
```

## 5. Event-Driven Core

Everything important should be represented as an internal event.

Core events:

- `wallet.buy.detected`
- `wallet.sell.detected`
- `fomo.buy.detected`
- `fomo.sell.detected`
- `token.discovered`
- `token.scan.requested`
- `token.scan.completed`
- `token.risk.changed`
- `token.momentum.changed`
- `token.narrative.changed`
- `token.convergence.detected`
- `alert.created`
- `alert.sent`
- `outcome.snapshot.created`

### Watched wallet buy flow

```text
On-chain/FOMO provider
        ↓
Normalize trade
        ↓
Match against watched entities
        ↓
wallet.buy.detected
        ↓
deduplicate event
        ↓
token.scan.requested
        ↓
parallel intelligence fetches
        ↓
aggregate
        ↓
score
        ↓
qualify?
   ┌────┴────┐
   no        yes
   │          │
store       alert
```

## 6. Token Scan

A scan should gather:

### Market
- price
- market cap
- FDV
- liquidity
- volume
- buys
- sells
- unique buyers where provider supports it
- pair age
- price changes
- pair count
- quote asset
- DEX

### Security
- mint authority
- freeze authority
- token program
- Token-2022 extensions
- creator/deployer
- creator holdings
- creator sells
- holder concentration
- suspicious clusters
- bundled launch indicators
- liquidity changes

### Holder
- holder count
- holder growth
- top 10 concentration
- top 20 concentration
- top holder size
- new holder velocity

### Wallet
- watched wallets in token
- FOMO traders holding token
- FOMO traders newly entering
- known wallet relationships
- cluster membership
- wallet history where available

### X
- token/name/symbol query matches
- contract-address query matches
- unique authors
- mention counts
- mention velocity
- engagement
- repeated authors
- narrative text
- spam concentration
- narrative acceleration

## 7. Watchlist Model

A user can watch:

### Raw wallet

`/watchwallet <solana_address>`

### FOMO account

`/watchfomo <handle>`

The FOMO account must be resolved to a Solana wallet through the FOMO provider adapter.

Never silently assume a FOMO username equals an on-chain address.

### Groups

Users can organize watched entities into groups:

- My Smart Money
- Early Runners
- FOMO Traders
- Personal
- Custom

A watched entity can belong to multiple groups.

## 8. Convergence

A convergence event occurs when multiple independent watched entities buy the same token inside a configurable window.

Default:
- window: 15 minutes
- minimum independent entities: 2
- strong convergence: 3+
- FOMO and raw-wallet entities count separately only if they resolve to independent wallets

Do not count duplicate identity representations twice.

Example:

```text
Wallet A -> 7x...
FOMO @alice -> 7x...

These are one underlying entity.
```

Cluster analysis must also reduce false independence.

Convergence record:

- token
- event window
- entity count
- wallet count
- FOMO account count
- unique wallet count
- cluster-adjusted count
- first entry timestamp
- latest entry timestamp
- total observed USD size
- entities involved

## 9. Scoring

Initial score is 100 points.

- Security/Structure: 25
- Demand: 20
- Liquidity: 15
- Holder Growth: 15
- Wallet Intelligence: 10
- Momentum: 10
- X/Narrative: 5

Score is deterministic and explainable.

Never output only a number.

Every alert should expose:
- score
- confidence
- top positive signals
- top risk signals
- data freshness

A score means "research priority", not a trading instruction.

## 10. Confidence

Confidence is separate from score.

Confidence should fall when:
- provider data is stale
- critical fields are unavailable
- X data is unavailable
- holder data is incomplete
- wallet identity is uncertain
- providers disagree materially

Example:

```text
RADAR 84/100
CONFIDENCE 91%
DATA AGE 18s
```

Do not invent precision. Confidence should be derived from actual data completeness/quality.

## 11. Historical Tracking

Every tracked token gets snapshots.

Required checkpoints:
- detection
- +15m
- +30m
- +1h
- +3h
- +6h
- +12h
- +24h
- +7d

Capture:
- MC
- liquidity
- price
- volume
- holders
- buyers
- sellers
- radar score
- confidence
- wallet signals
- X signals
- risk flags

Outcome metrics:
- peak MC
- peak multiple from detection
- time to peak
- maximum drawdown
- liquidity survival
- token status

This dataset is a core V1 feature.

## 12. Alert Rules

Alert types:
- `WATCHED_WALLET_SIGNAL`
- `FOMO_SIGNAL`
- `CONVERGENCE`
- `MOMENTUM_SPIKE`
- `NARRATIVE_ACCELERATION`
- `RISK_CHANGE`
- `SCORE_CROSS`
- `LIQUIDITY_CHANGE`

Default anti-spam:
- same token max one qualifying alert per 15 minutes
- user max 5 alerts/hour
- convergence events are aggregated
- repeated low-quality signals are suppressed

Users can configure thresholds.

## 13. Security Principles

- Never request seed phrases.
- Never request private keys.
- Never sign transactions.
- Never add trading execution dependencies.
- API secrets stay server-side.
- Telegram user IDs are authorization boundaries.
- Validate every Solana address.
- Encrypt provider credentials at rest where infrastructure supports it.
- Log security-sensitive events without secrets.

## 14. Failure Handling

Every external provider must have:
- timeout
- retry with exponential backoff
- rate-limit handling
- circuit breaker
- stale-data marker
- structured error
- health metric

A provider failure must not crash the scan engine.

Partial scan is allowed, but confidence must decrease and the missing source must be shown.

## 15. Non-Functional Requirements

Target:
- watched wallet event to scan start: <5 seconds when provider supports realtime events
- normal token scan: <10 seconds
- Telegram alert after completed scan: <3 seconds
- idempotent processing
- horizontally scalable workers
- no blocking provider calls inside Telegram handlers

## 16. Implementation Rule

Build the data pipeline before optimizing UI.

Do not build fake provider responses into production paths.

Mocks are allowed only behind explicit development adapters.
