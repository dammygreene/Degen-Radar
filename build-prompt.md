# BUILD PROMPT: DEGEN RADAR V1

You are the implementation agent for Degen Radar V1.

Build the actual production-ready Telegram bot and backend described in `blueprint.md`.

Read ALL markdown files in this directory before changing code.

## Product

Degen Radar is an event-driven Solana memecoin intelligence bot.

It watches:
1. Solana market discovery
2. user-defined Solana wallets
3. FOMO trader accounts
4. token momentum
5. token security/structure
6. wallet behavior
7. X narrative activity

Core behavior:

If a watched wallet buys a token:
1. detect the buy
2. identify the token
3. deduplicate the event
4. automatically scan the token
5. gather market/security/holder/wallet/X intelligence
6. calculate score + confidence
7. if it passes user alert criteria, send Telegram alert
8. otherwise store the result silently

If multiple watched wallets/FOMO traders buy the same token within the convergence window:
1. aggregate the entries
2. resolve duplicate identities
3. check wallet clusters
4. run/refresh the token scan
5. create a convergence event
6. alert if qualification rules pass

## Hard constraints

DO NOT implement:
- trading
- copy trading
- private keys
- seed phrases
- transaction signing
- auto-buy
- auto-sell
- sniping
- leverage

This is research infrastructure.

## Technical stack

Preferred:
- TypeScript
- Node.js
- Fastify
- grammY
- PostgreSQL
- Drizzle ORM
- Redis
- BullMQ
- Solana web3 libraries
- Zod
- Vitest
- Docker Compose for local infrastructure

Use the existing repository conventions if a repository already exists. Do not rewrite the project unnecessarily.

## Provider architecture

Create interfaces/adapters:

```ts
interface MarketDataProvider {
  searchTokens(query: string): Promise<TokenMarketData[]>
  getToken(address: string): Promise<TokenMarketData>
  getPairs(address: string): Promise<PairMarketData[]>
}

interface ChainProvider {
  getTokenSecurity(address: string): Promise<TokenSecurityData>
  getHolders(address: string): Promise<HolderData>
  getWalletTrades(address: string, since?: Date): Promise<Trade[]>
}

interface WalletIntelProvider {
  getWalletProfile(address: string): Promise<WalletProfile>
  getWalletActivity(address: string): Promise<Trade[]>
  getTokenSmartMoney(address: string): Promise<SmartMoneyHolder[]>
}

interface FomoProvider {
  resolveTrader(handle: string): Promise<FomoTrader>
  getTrader(handle: string): Promise<FomoTrader>
  getTraderPositions(handle: string): Promise<FomoPosition[]>
  getTokenHolders(token: string): Promise<FomoHolder[]>
  subscribeTrades(filters: FomoStreamFilter): AsyncIterable<FomoTradeEvent>
}

interface XProvider {
  searchPosts(query: string, options: SearchOptions): Promise<XPost[]>
  getAuthor(id: string): Promise<XAuthor>
}
```

Do not put provider-specific response shapes into domain code.

## Environment

Create `.env.example`.

Required variables should include placeholders for:
- DATABASE_URL
- REDIS_URL
- TELEGRAM_BOT_TOKEN
- SOLANA_RPC_URL
- FOMO_API_KEY
- X_BEARER_TOKEN

Optional:
- BIRDEYE_API_KEY
- DEXSCREENER_BASE_URL
- X_SEARCH_ENABLED
- SCAN_MIN_MC
- SCAN_MAX_MC
- MIN_LIQUIDITY
- CONVERGENCE_WINDOW_SECONDS
- ALERT_SCORE_THRESHOLD

Never commit real secrets.

## Database

Implement the schema from `data-model.md`.

At minimum:
- users
- watched_entities
- watch_groups
- watch_group_members
- tokens
- token_pairs
- token_snapshots
- token_security
- holders
- wallets
- wallet_relationships
- wallet_trades
- fomo_traders
- fomo_trader_wallets
- fomo_positions
- social_snapshots
- convergence_events
- convergence_members
- scans
- scan_signals
- alerts
- outcome_snapshots
- provider_health

Use UUIDs for internal IDs and store chain addresses as strings with unique constraints where appropriate.

## Event bus

Create typed event definitions.

Example:

```ts
type RadarEvent =
  | WalletBuyDetected
  | FomoBuyDetected
  | TokenScanRequested
  | TokenScanCompleted
  | ConvergenceDetected
  | AlertCreated
```

Every event needs:
- eventId
- eventType
- occurredAt
- source
- idempotencyKey
- payload

Use BullMQ queues.

Queues:
- discovery
- chain-events
- token-scans
- wallet-intel
- x-intel
- scoring
- alerts
- outcomes

## Wallet monitoring

Implement two ingestion paths.

### Path A: direct Solana wallet monitoring

For watched wallets, use Solana RPC/websocket mechanisms where practical.

Normalize swaps into:

```ts
{
  wallet,
  tokenAddress,
  side: "BUY" | "SELL",
  amountToken,
  amountUsd,
  timestamp,
  signature,
  source
}
```

Do not classify arbitrary token transfers as buys.

Prefer swap/DEX transaction evidence.

### Path B: FOMO account monitoring

Resolve `/watchfomo @handle`.

Store:
- handle
- resolved Solana wallet
- FOMO profile ID if available
- last sync
- PnL windows
- account age if available

Subscribe to FOMO realtime trade events when available.

If realtime is unavailable, use polling with backoff and mark event latency.

## Token scan orchestrator

Create:

```ts
scanToken(tokenAddress, reason, context)
```

Reason examples:
- WATCHED_WALLET_BUY
- FOMO_BUY
- CONVERGENCE
- MANUAL
- DISCOVERY
- MOMENTUM

Run independent fetches in parallel where safe.

Do not fail the entire scan because X or one provider is unavailable.

Return:

```ts
{
  token,
  market,
  security,
  holders,
  walletIntel,
  fomoIntel,
  social,
  score,
  confidence,
  signals,
  risks,
  scannedAt
}
```

## Scoring

Implement pure functions.

```ts
scoreSecurity(...)
scoreDemand(...)
scoreLiquidity(...)
scoreHolderGrowth(...)
scoreWalletIntel(...)
scoreMomentum(...)
scoreNarrative(...)
calculateConfidence(...)
calculateRadarScore(...)
```

Each function must be unit tested.

The output must contain human-readable reasons.

Example:

```ts
{
  category: "MOMENTUM",
  points: 8,
  maxPoints: 10,
  direction: "positive",
  reason: "1h volume increased 187% while unique buyers increased 74%"
}
```

## X intelligence

X must be an actual V1 provider, but isolated behind `XProvider`.

Search should use several query forms where supported:
- `$SYMBOL`
- token symbol without `$`
- contract address
- project name
- relevant aliases

Store raw post IDs and normalized metrics.

Calculate:
- mentions 15m
- mentions 1h
- mentions 6h
- mentions 24h
- unique authors
- engagement
- repeated author concentration
- mention velocity
- narrative acceleration

Never fabricate a narrative.

Narrative summaries must be grounded in retrieved posts.

If an LLM is later used to summarize posts, feed it retrieved evidence and store the source post IDs.

## FOMO integration

Current FOMO API supports:
- trader leaderboards
- handle-to-wallet resolution
- trades/positions
- balances/holdings
- token holders
- theses
- realtime trade feed

Use it through `FomoProvider`.

Important:
FOMO API is an independent/unofficial data layer for fomo.family. Do not describe it as an official FOMO Family API.

Do not make the application depend on undocumented/private FOMO Family endpoints.

## DEX Screener integration

Use the official API adapter.

Useful surfaces include:
- token profiles
- search
- token pairs
- pairs
- token market data

Do not treat boosts as bullish evidence by default. Store them as contextual metadata.

Respect provider rate limits.

## Telegram UX

Commands:

```text
/start
/help
/scan
/token <address>
/watchwallet <address>
/watchfomo <handle>
/unwatch <address_or_handle>
/watchlist
/groups
/group <name>
/wallet <address>
/settings
/status
```

Use inline buttons where helpful:
- Token
- Chart
- Holders
- Wallets
- X
- Watch
- Mute

### `/scan`

Return top currently qualifying candidates.

### `/token`

Return a detailed scan.

### `/watchwallet`

Validate address and confirm tracking.

### `/watchfomo`

Resolve account and confirm the underlying Solana wallet.

### `/watchlist`

Show:
- wallets
- FOMO accounts
- groups
- active/inactive state

## Alert formatting

Example:

```text
🚨 RADAR SIGNAL

$ABC

MC        $34.8K
Liquidity $15.7K
Age       42m

RADAR     86/100
Confidence 91%

WHY

🟢 Watched wallet entered
🟢 Holder growth accelerating
🟢 Volume accelerating
🟢 Healthy liquidity
🟢 No major security flags
🟢 X mentions accelerating

WATCHED ACTIVITY

@trader1
Entry MC  $31.4K
Size      ~$850

[CHART] [TOKEN] [WALLETS] [X]
```

Convergence:

```text
🔥 WALLET CONVERGENCE

$ABC

4 watched entities entered
within 7 minutes.

3 independent wallets
1 FOMO trader

RADAR      89/100
Confidence 93%

[VIEW TOKEN] [WALLETS]
```

Risk:

```text
⚠️ RISK CHANGE

$ABC

Creator sold 4.2% of supply.
Liquidity decreased 18%.

Radar: 84 → 61

[VIEW TOKEN]
```

## Alert qualification

Implement configurable rules:

```ts
qualifiesForAlert(scan, context, settings)
```

Example defaults:
- score >= 75
- confidence >= 70
- no critical security flag
- minimum liquidity
- token age within configured range
- if convergence: >=2 independent entities

Do not hardcode "BUY".

## Deduplication

Every external trade must have an idempotency key.

Examples:
- Solana: `${signature}:${wallet}`
- FOMO: provider event ID if available
- fallback: hash of trader + token + side + timestamp bucket + size

A duplicate event must never create duplicate scans/alerts.

## Convergence engine

For every qualifying buy:
1. write entry
2. query recent entries for token
3. resolve underlying wallets
4. remove duplicate identity representations
5. apply cluster relationships
6. calculate independent entity count
7. if threshold met, emit `token.convergence.detected`

Aggregate alerts.

## Historical outcome engine

When a token enters tracking:
- create detection snapshot
- schedule future snapshots

Do not rely on a single cron that can lose work. Use durable delayed BullMQ jobs.

If the process restarts, pending outcome jobs must be recoverable.

## Observability

Log structured JSON.

Every scan should include:
- scanId
- token
- trigger
- provider timings
- provider failures
- score
- confidence
- alert decision

Add:
- queue depth
- provider error rate
- provider latency
- scan duration
- alerts/hour
- duplicate events
- stale data count

## Build rules

1. Inspect the repository before changing anything.
2. Preserve existing working code.
3. Build in small vertical slices.
4. After each slice, run tests/typecheck/lint.
5. Never silently swallow errors.
6. Never commit secrets.
7. Never use fake data in production paths.
8. Every provider gets an adapter and a mock implementation for tests.
9. Prefer deterministic logic over AI.
10. Do not introduce ML in V1.

## Definition of done

A local deployment is complete when:

1. Bot starts.
2. Database migrates.
3. Redis starts.
4. `/start` works.
5. A wallet can be watched.
6. A FOMO account can be watched.
7. Watched wallet buy event can trigger a scan.
8. FOMO buy event can trigger a scan.
9. Token scan combines all available providers.
10. Score and confidence are calculated.
11. Convergence is detected.
12. Telegram alert is sent only when rules qualify.
13. Historical snapshots are scheduled and persisted.
14. Provider failures degrade confidence rather than crash the system.
15. Test suite passes.
16. No private keys or signing code exist.
