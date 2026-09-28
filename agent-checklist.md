# Agent Checklist

Use this as the final implementation checklist.

## Foundation
- [ ] repo audited
- [ ] config validation
- [ ] DB connected
- [ ] migrations
- [ ] Redis
- [ ] BullMQ
- [ ] Telegram bot
- [ ] health endpoint

## Providers
- [ ] DEX Screener adapter
- [ ] Solana adapter
- [ ] FOMO adapter
- [ ] Birdeye adapter
- [ ] X adapter
- [ ] retries
- [ ] rate limits
- [ ] provider health

## Market
- [ ] discovery
- [ ] token lookup
- [ ] pair lookup
- [ ] snapshots
- [ ] market velocity

## Security
- [ ] mint authority
- [ ] freeze authority
- [ ] Token-2022
- [ ] creator
- [ ] concentration
- [ ] liquidity changes
- [ ] cluster/bundle signals

## Wallets
- [ ] watch wallet
- [ ] unwatch
- [ ] wallet events
- [ ] wallet profile
- [ ] FOMO watch
- [ ] FOMO resolution
- [ ] FOMO realtime
- [ ] watched entity groups

## X
- [ ] recent search
- [ ] author aggregation
- [ ] mention windows
- [ ] engagement
- [ ] velocity
- [ ] narrative evidence
- [ ] stale/unavailable handling

## Radar
- [ ] demand score
- [ ] liquidity score
- [ ] holder score
- [ ] wallet score
- [ ] momentum score
- [ ] narrative score
- [ ] security score
- [ ] confidence
- [ ] reason generation

## Events
- [ ] buy detection
- [ ] deduplication
- [ ] automatic scan
- [ ] scan coalescing
- [ ] convergence
- [ ] cluster adjustment

## Alerts
- [ ] qualifying alert
- [ ] convergence alert
- [ ] risk alert
- [ ] cooldown
- [ ] user settings
- [ ] Telegram buttons

## Historical
- [ ] detection snapshot
- [ ] +15m
- [ ] +30m
- [ ] +1h
- [ ] +3h
- [ ] +6h
- [ ] +12h
- [ ] +24h
- [ ] +7d
- [ ] peak
- [ ] drawdown
- [ ] survival

## Security
- [ ] no private keys
- [ ] no signing
- [ ] no execution
- [ ] secret-safe logs
- [ ] per-user authorization

## Quality
- [ ] unit tests
- [ ] integration tests
- [ ] provider fixtures
- [ ] typecheck
- [ ] lint
- [ ] clean migration
- [ ] restart test
- [ ] queue recovery test
