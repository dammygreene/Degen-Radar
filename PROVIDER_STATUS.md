# Provider Status

Snapshot of every external provider integration after the production-pipeline milestone.

Legend: **Live** = real adapter hitting the real API when credentials are set ·
**Mock** = deterministic dev adapter (only when `USE_MOCK_PROVIDERS=true`) ·
**Disabled** = returns null and lowers scan confidence when credentials are absent
(production never fabricates data).

---

## DEX Screener
- **Adapter:** `src/providers/dex-screener/adapter.ts`
- **Credentials:** none required
- **Live or mock:** **Live** (mock only in explicit mock mode)
- **Realtime:** no (pull) · **Historical:** no
- **Rate-limit behavior:** shared HTTP client (timeout → retry/backoff → circuit breaker); 429 respected
- **Notes:** multi-pair selection is deterministic (highest-liquidity pair is primary; liquidity summed across Solana pairs). Boosts stored as context, never treated as bullish.

## Solana RPC
- **Adapter:** `src/providers/solana/adapter.ts`
- **Credentials:** `SOLANA_RPC_URL`
- **Live or mock:** **Live** when RPC URL set; otherwise dev chain adapter
- **Realtime:** n/a here · **Historical:** n/a here
- **Rate-limit behavior:** retry + timeout
- **Notes:** mint/freeze authority + token program fetched on-chain via `getParsedAccountInfo`. Holder concentration / creator analysis require an indexer → returned as `partial`/`unavailable` (confidence penalty), never fabricated.

## Helius  (NEW)
- **Adapter:** `src/providers/helius/adapter.ts` · parser `src/providers/helius/parse.ts`
- **Credentials:** `HELIUS_API_KEY`, optional `HELIUS_WEBHOOK_SECRET`
- **Live or mock:** **Live** when API key set; otherwise **Disabled**
- **Realtime:** **yes** via webhook (`POST /webhooks/helius`) · **Historical:** **yes** via parsed address-transactions backfill
- **Rate-limit behavior:** shared HTTP client with retry/backoff/circuit breaker
- **Known limitations:**
  - Webhook auth uses the `Authorization` header compared to `HELIUS_WEBHOOK_SECRET` (constant-time). In non-production a missing secret is allowed for local testing.
  - Webhook registration/address mutation requires a Helius webhook id (not yet auto-provisioned) — `subscribeWallet` logs intent when unset.
  - USD pricing of a swap is not derived from Helius alone (`amountUsd = null`; enriched later by market data).
- **Swap classification:** a BUY/SELL is only produced from genuine SWAP evidence (`type === "SWAP"` or an `events.swap` block, wallet on the memecoin side). Plain transfers, airdrops, migrations and failed txs never produce trades. Covered by `tests/helius.test.ts`.

## FOMO  (NOW REAL)
- **Adapter:** `src/providers/fomo/adapter.ts` · realtime `src/providers/fomo/realtime.ts`
- **Credentials:** `FOMO_API_KEY`
- **Live or mock:** **Live** when API key set; otherwise **Disabled** (mock only in mock mode)
- **Realtime:** **yes** via `FomoRealtimeManager` (single logical WS, dynamic trader filters, reconnect w/ backoff+jitter, heartbeat, subscription restore) · **Historical:** trades/positions/holders via HTTP
- **Rate-limit behavior:** shared HTTP client
- **Known limitations:**
  - FOMO API is an **independent/unofficial** data layer for fomo.family — never represented as official.
  - Endpoint paths are mapped defensively; exact response fields depend on the live plan and are normalized behind the adapter.
  - A handle may resolve to multiple wallets (`getTraderWallets`), all stored as relationships.
  - Live WS payload shape is normalized by `FomoAdapter.normalizeRealtimeTrade` (unit-tested); field names may need confirmation against the live feed.

## X (Twitter)  (NOW REAL)
- **Adapter:** `src/providers/x/adapter.ts` · query builder `src/domain/x/query.ts` · windows `src/domain/x/windows.ts`
- **Credentials:** `X_BEARER_TOKEN`
- **Live or mock:** **Live** when bearer token set; otherwise **Disabled**
- **Realtime:** no · **Historical:** Recent Search (last 7 days), up to 100/req, paginated
- **Rate-limit behavior:** shared HTTP client; 401/403 treated as non-retryable
- **Notes:** query set combines `$SYMBOL`/symbol/name/contract, excludes retweets (not replies). Acceleration uses explicit states (`INSUFFICIENT_HISTORY`, `NO_PRIOR_ACTIVITY`, `ACCELERATING`, `STABLE`, `DECELERATING`) — never Infinity. Narrative summaries are grounded in retrieved posts with stored `sourcePostIds`.

## Birdeye
- **Adapter:** dev wallet-intel adapter (`MockWalletIntelProvider`)
- **Credentials:** `BIRDEYE_API_KEY`
- **Live or mock:** supplementary; **Mock** placeholder behind `WalletIntelProvider`
- **Notes:** the interface is in place; a real Birdeye adapter can be dropped in without touching domain/service code. Intentionally not on the critical path.

---

## Credential-blocked live testing

This build was developed in an environment **without provider credentials or a
live Postgres/Redis**. Per the milestone instructions:

- **PASS:** interfaces + adapter implementations + normalization + fixture tests.
- **BLOCKED (no credentials):** live end-to-end calls to Helius/FOMO/X and live
  webhook/WS delivery. The pipeline is exercised end-to-end with fixtures and
  in-memory implementations (see `tests/pipeline.e2e.test.ts`).
