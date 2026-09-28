# Degen Radar V1 Integrations

## 1. DEX Screener

Official API documentation:
https://docs.dexscreener.com/api/reference

Useful endpoints include:
- token profiles
- search
- token pairs
- pairs
- token lookup

The current reference documents token/pair endpoints and rate limits. Keep all limits configurable in the adapter rather than scattering them through application code.

Use DEX Screener primarily for market/pair discovery and normalized market context.

Do not make boosts a bullish score by default.

Important licensing note:
DEX Screener's API terms restrict using the API to construct/enhance/market a product whose primary purpose directly competes with DEX Screener. Review the current terms before public/commercial deployment.

## 2. FOMO API

Official documentation:
https://fomoapi.io/

Current API surface includes:
- `GET /v2/leaderboard/{window}`
- `GET /v2/users/{handle}`
- trader positions/trades/balances
- `GET /token/{address}/holders`
- thesis endpoints
- realtime WebSocket alerts

WebSocket:
`wss://api.fomoapi.io/ws/alerts`

FOMO API describes itself as an independent/unofficial data layer for fomo.family. Do not represent it as an official FOMO Family API.

Use:
- handle -> wallet resolution
- trader PnL/context
- current holdings
- token -> FOMO holders
- realtime buy/sell events

Do not scrape fomo.family directly.

Treat FOMO holdings as snapshots and refresh when freshness matters.

## 3. Birdeye

Official docs:
https://docs.birdeye.so/

Use as a supplementary market/wallet/on-chain provider.

Relevant current capabilities include wallet data and Solana smart-money APIs. Availability depends on plan.

The adapter must gracefully handle plan-specific 403/429 responses.

Do not make V1 logically dependent on a single premium endpoint.

## 4. Solana RPC

Use Solana RPC/WebSocket for:
- wallet activity
- token account state
- mint/freeze authorities
- transaction signatures
- transaction parsing
- event monitoring where feasible

Use a provider abstraction:
- public/dev RPC for local development
- configurable production RPC

Never hardcode a public RPC as a production reliability assumption.

## 5. X API

Official documentation:
https://docs.x.com/

Use the official X API for narrative intelligence.

The provider should support recent search and pagination.

Normalize:
- post ID
- author ID
- created_at
- text
- public metrics
- author metadata where permitted
- referenced/quoted post IDs where available

Query variants:
- `$SYMBOL`
- symbol
- token name
- contract address
- known aliases

Avoid overly broad symbol queries when symbols are ambiguous.

X availability, pricing, limits, and product tiers can change. Keep provider configuration isolated.

Do not scrape X.

## Provider interface rule

All providers implement internal interfaces.

```text
providers/
  dex-screener/
  fomo/
  birdeye/
  solana/
  x/
```

Application services import domain interfaces, not provider response types.

## Provider priority

Critical:
- Solana
- market data

High:
- FOMO
- holder/security

Important:
- X

Supplementary:
- Birdeye

If a provider is down, scan can complete partially with lower confidence.
