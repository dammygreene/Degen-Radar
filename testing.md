# Degen Radar V1 Testing Strategy

## Unit tests

Required:
- score calculations
- confidence calculations
- momentum calculations
- holder growth
- buy/sell ratios
- concentration
- convergence grouping
- cluster-adjustment
- alert qualification
- cooldown
- deduplication
- address validation
- FOMO identity resolution

## Provider tests

Each provider gets:
- success fixture
- 429 fixture
- 401/403 fixture
- timeout fixture
- malformed response fixture
- partial response fixture

Never call real APIs from unit tests.

## Integration tests

Use test PostgreSQL + Redis.

Test:
1. create user
2. watch wallet
3. ingest buy
4. queue scan
5. persist scan
6. score
7. qualify
8. create alert
9. deduplicate second identical event

## Convergence tests

Case A:
- wallet A buys
- wallet B buys
- both independent
Expected:
- convergence count 2

Case B:
- wallet A buys
- FOMO account resolves to wallet A
Expected:
- unique wallet count 1

Case C:
- wallet A/B/C are same cluster
Expected:
- cluster-adjusted count reduced

Case D:
- A/B/C independent
Expected:
- strong convergence

## Outcome tests

Create a detection snapshot and synthetic future snapshots.

Verify:
- peak MC
- peak multiple
- time to peak
- drawdown
- survival

## Load tests

Simulate:
- 1,000 watched wallets
- bursts of wallet events
- 100 simultaneous token scans
- repeated same-token buys

Verify:
- no duplicate alerts
- queues recover
- scan coalescing works
- provider rate limits are respected

## Security tests

Verify:
- Telegram user cannot access another user's watchlist
- provider keys never appear in Telegram output
- secrets do not enter logs
- invalid wallet input rejected
- SQL injection impossible through filters
- no transaction signing code exists

## Definition of done

All unit/integration tests pass.

Typecheck passes.

Lint passes.

Migrations pass on a clean database.

Bot and workers restart without corrupting queue state.
