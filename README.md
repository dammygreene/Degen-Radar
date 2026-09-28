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

This repository/spec is intentionally research-first. V1 does NOT execute trades, store private keys, or provide copy trading.

## Files

- `blueprint.md` - complete technical/product architecture
- `build-prompt.md` - master prompt for the coding agent
- `plan.md` - implementation phases and acceptance criteria
- `architecture.md` - services, queues, events and data flow
- `data-model.md` - PostgreSQL schema and relationships
- `scoring.md` - deterministic scoring engine
- `integrations.md` - provider adapters and current API notes
- `telegram.md` - bot commands, screens and alerts
- `testing.md` - testing strategy and definition of done
- `env.example` - required environment variables
