# Degen Radar V1 Architecture

## Domain modules

```text
src/
  app/
  bot/
  config/
  db/
  domain/
    tokens/
    wallets/
    scans/
    scoring/
    convergence/
    alerts/
    outcomes/
  events/
  jobs/
  providers/
    dex-screener/
    solana/
    birdeye/
    fomo/
    x/
  services/
    discovery/
    scan-orchestrator/
    wallet-monitor/
    fomo-monitor/
    x-intelligence/
    outcome-tracker/
  utils/
```

## Provider rule

Domain code must not import provider SDK types.

Bad:

```ts
import { SomeFomoResponse } from "fomo-sdk";
```

Good:

```ts
import { FomoTrader } from "@/domain/wallets/types";
```

The adapter maps external data into domain types.

## Queues

### discovery
Discovers candidate tokens.

### chain-events
Processes wallet/on-chain events.

### token-scans
Runs complete token scans.

### wallet-intel
Fetches wallet/FOMO intelligence.

### x-intel
Fetches and aggregates X data.

### scoring
Calculates score and confidence.

### alerts
Delivers Telegram alerts.

### outcomes
Creates future snapshots.

## Event lifecycle

```text
external source
   ↓
adapter
   ↓
normalizer
   ↓
deduplicator
   ↓
domain event
   ↓
queue
   ↓
handler
   ↓
database
   ↓
next event
```

## Scan lifecycle

```text
REQUESTED
  ↓
RUNNING
  ↓
PARTIAL or COMPLETE
  ↓
SCORED
  ↓
QUALIFIED or REJECTED
```

A failed provider does not equal failed scan.

## Caching

Redis may cache:
- token market data
- FOMO trader profile
- FOMO holder list
- X search results
- wallet profile
- provider rate-limit state

Cache keys must contain:
- provider
- resource
- address/query
- relevant time window

Never cache highly volatile holdings for long periods.

## Database principles

Store raw provider IDs where useful for reconciliation.

Store normalized domain data separately.

Store timestamps on all market/intelligence observations.

Never overwrite historical snapshots with current values.

## Idempotency

Database uniqueness constraints are part of event safety.

Do not rely only on in-memory deduplication.

## Concurrency

A token may receive several buy events simultaneously.

Use:
- token-level scan locks
- Redis locks or DB advisory locks
- short TTL
- scan coalescing

If five wallets buy a token within 20 seconds, prefer one fresh scan plus a convergence aggregation rather than five identical scans.
