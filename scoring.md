# Degen Radar V1 Scoring Specification

## Principle

The score is a research-priority score.

It is NOT:
- a guaranteed prediction
- a trading instruction
- a probability of profit
- a probability that a token will run

Every category must produce evidence.

## Total

100 points.

### Security / Structure: 25

Positive:
- no active mint authority where appropriate
- no active freeze authority where appropriate
- reasonable top-holder distribution
- reasonable creator exposure
- no obvious creator dumping
- no strong cluster/bundle warning

Negative:
- active control authorities
- extreme concentration
- suspicious creator behavior
- severe liquidity withdrawal
- strong coordinated-wallet evidence

Important:
An authority being active is a risk flag, not automatic proof of malicious intent.

### Demand: 20

Measure:
- buy count
- unique buyers
- buy/sell ratio
- volume
- volume relative to liquidity
- buyer acceleration

Reward sustained demand rather than one candle.

### Liquidity: 15

Measure:
- absolute liquidity
- liquidity/MC ratio
- liquidity change
- volume/liquidity relationship

Penalize:
- extremely thin liquidity
- rapidly disappearing liquidity

### Holder Growth: 15

Measure:
- holder growth
- new holders per minute
- holder acceleration
- concentration change

Reward:
- growing holder base
- declining concentration

### Wallet Intelligence: 10

Inputs:
- watched wallet buys
- FOMO trader buys
- FOMO trader quality context
- independent wallet count
- historical early-entry evidence

Do not reward the same wallet twice.

### Momentum: 10

Inputs:
- MC velocity
- price velocity
- volume velocity
- buyer velocity
- liquidity velocity

Reward acceleration with confirmation.

### X/Narrative: 5

Inputs:
- mention velocity
- unique authors
- engagement
- narrative clarity
- organic discussion
- spam concentration

Do not score raw mention count alone.

## Confidence

Start at 100 and reduce based on missing/low-quality evidence.

Example penalties:
- critical provider missing: -15
- market data stale: -10
- holder data unavailable: -10
- X unavailable: -5
- wallet identity uncertain: -10

Clamp to 0..100.

Confidence is about evidence completeness/reliability, not token quality.

## Alert qualification

Default:

```text
score >= 75
confidence >= 70
no critical risk flag
liquidity >= configured minimum
```

Convergence:
```text
independent entities >= 2
```

Strong convergence:
```text
independent entities >= 3
```

Users can change thresholds.

## Signal reasons

Bad:
"Momentum is good."

Good:
"1h volume increased 187% while unique buyers increased 74%."

Bad:
"Smart money bullish."

Good:
"Two watched wallets entered within 8 minutes; both are independent of the same known cluster."

## Missing data

Never convert missing data to zero without documenting it.

Example:
- X unavailable -> `narrativeStatus = UNAVAILABLE`
- holder API failed -> confidence penalty
- wallet PnL unavailable -> wallet signal marked incomplete

## Calibration

Do not tune weights based on a handful of successful tokens.

Collect historical outcomes first.

Future versions may use statistical calibration, but V1 remains deterministic.
