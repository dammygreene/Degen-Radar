# Degen Radar V1 Data Model

## users

- id UUID PK
- telegram_user_id BIGINT UNIQUE
- username TEXT NULL
- created_at
- updated_at
- alert_enabled BOOLEAN
- min_alert_score INT
- min_confidence INT

## watch_groups

- id UUID PK
- user_id FK
- name TEXT
- created_at

UNIQUE(user_id, name)

## watched_entities

- id UUID PK
- user_id FK
- entity_type ENUM(wallet, fomo)
- label TEXT NULL
- wallet_address TEXT NULL
- fomo_handle TEXT NULL
- provider_identity TEXT NULL
- enabled BOOLEAN
- created_at
- updated_at

Unique rules must prevent duplicate representations for the same user.

## watch_group_members

- group_id FK
- watched_entity_id FK
- created_at

Composite PK.

## wallets

- id UUID PK
- address TEXT UNIQUE
- chain TEXT
- label TEXT NULL
- first_seen_at
- last_seen_at
- pnl_24h NUMERIC NULL
- pnl_7d NUMERIC NULL
- pnl_30d NUMERIC NULL
- pnl_all NUMERIC NULL

## fomo_traders

- id UUID PK
- handle TEXT UNIQUE
- profile_data JSONB
- last_synced_at
- created_at

## fomo_trader_wallets

- fomo_trader_id FK
- wallet_id FK
- chain
- confidence NUMERIC
- first_seen_at
- last_verified_at

## tokens

- id UUID PK
- chain
- address TEXT UNIQUE
- symbol TEXT
- name TEXT
- decimals INT NULL
- first_seen_at
- last_seen_at
- status ENUM(discovered, tracking, cooled, dead, rejected)

## token_pairs

- id UUID PK
- token_id FK
- pair_address TEXT UNIQUE
- dex TEXT
- quote_address TEXT
- created_at
- last_seen_at

## token_snapshots

- id UUID PK
- token_id FK
- captured_at
- price_usd
- market_cap_usd
- fdv_usd
- liquidity_usd
- volume_15m
- volume_1h
- volume_6h
- volume_24h
- buys_15m
- sells_15m
- holders
- unique_buyers
- unique_sellers

Indexes:
- token_id + captured_at
- captured_at
- market_cap_usd

## token_security

- token_id FK
- captured_at
- mint_authority
- freeze_authority
- token_program
- token2022_extensions JSONB
- creator_address
- creator_balance_pct
- top10_pct
- top20_pct
- suspicious_cluster_score
- risk_flags JSONB

## holders

- id UUID PK
- token_id FK
- wallet_id FK
- captured_at
- balance
- percentage
- value_usd

## wallet_trades

- id UUID PK
- wallet_id FK
- token_id FK
- side
- signature TEXT NULL
- provider_event_id TEXT NULL
- amount_token
- amount_usd
- occurred_at
- source
- raw JSONB

Unique on the strongest available event identity.

## wallet_relationships

- id UUID PK
- wallet_a FK
- wallet_b FK
- relationship_type
- confidence
- evidence JSONB
- first_seen_at
- last_seen_at

## fomo_positions

- id UUID PK
- fomo_trader_id FK
- token_id FK
- captured_at
- amount
- value_usd
- source

## social_snapshots

- id UUID PK
- token_id FK
- captured_at
- mentions_15m
- mentions_1h
- mentions_6h
- mentions_24h
- unique_authors
- likes
- replies
- quotes
- repeat_author_pct
- narrative_score
- narrative_summary TEXT NULL
- source_post_ids JSONB

## convergence_events

- id UUID PK
- token_id FK
- started_at
- ended_at
- entity_count
- unique_wallet_count
- fomo_count
- cluster_adjusted_count
- total_usd
- status

## convergence_members

- convergence_id FK
- watched_entity_id FK
- wallet_id FK
- event_id FK
- entered_at
- amount_usd

## scans

- id UUID PK
- token_id FK
- trigger_type
- trigger_entity_id NULL
- status
- started_at
- completed_at
- score
- confidence
- missing_sources JSONB
- error_summary TEXT NULL

## scan_signals

- id UUID PK
- scan_id FK
- category
- direction
- points
- max_points
- reason
- evidence JSONB

## alerts

- id UUID PK
- user_id FK
- token_id FK
- alert_type
- scan_id FK
- score
- confidence
- payload JSONB
- sent_at
- suppressed BOOLEAN
- suppression_reason TEXT NULL

## outcome_snapshots

- id UUID PK
- token_id FK
- detection_scan_id FK
- checkpoint
- captured_at
- market_cap_usd
- liquidity_usd
- price_usd
- radar_score
- confidence

## provider_health

- provider
- captured_at
- latency_ms
- status
- error_code
- rate_limit_remaining NULL
- metadata JSONB
