# Degen Radar V1 Telegram UX

## /start

```text
⚡ DEGEN RADAR

Solana memecoin intelligence.

I watch:
• low caps
• wallets
• FOMO traders
• momentum
• security
• X narrative

Add wallets or FOMO traders and I'll scan what they buy.

[SCAN] [WATCHLIST] [SETTINGS]
```

## /scan

Show qualifying current candidates.

Each candidate:

```text
$ABC
MC $41K
Liq $16K
Radar 82
Confidence 88%

🟢 Holder growth
🟢 Volume acceleration
🟢 Watched wallet activity
🟢 X acceleration

[VIEW]
```

## /token <address>

Show:

```text
$ABC

MC
Liquidity
Age
Price
Volume

RADAR
Confidence

SECURITY
HOLDERS
MOMENTUM
WALLETS
X

WHY
RISKS
```

Buttons:
- Chart
- Holders
- Wallets
- X
- Watch
- Refresh

## /watchwallet

Input:
`/watchwallet 7x...`

Validate address.

Reply:

```text
👀 Wallet added

Label:
7x...9ab

You'll be notified when this wallet buys a token that passes Radar criteria.
```

## /watchfomo

Input:
`/watchfomo @handle`

Resolve through provider.

Reply:

```text
👀 FOMO trader added

@handle
Solana wallet: 7x...9ab
30D PnL: ...
```

## /watchlist

Sections:

```text
WATCHLIST

WALLETS
1. Trader A
2. Whale B

FOMO
1. @trader1
2. @trader2

GROUPS
• Early Runners
• FOMO
• My Smart Money
```

## Wallet signal

```text
👀 WATCHED WALLET

@TraderA bought $ABC

Entry MC $28K
Size ~$920

Scanning...
```

If scan qualifies, follow with full alert.

## Convergence alert

```text
🔥 CONVERGENCE

$ABC

5 watched entities entered
within 11 minutes.

4 independent wallets
2 FOMO accounts

RADAR 88
CONFIDENCE 92%

🟢 Volume +204%
🟢 Holders +37%
🟢 X mentions +166%
🟢 Liquidity healthy

[VIEW TOKEN]
```

Note: entity count and unique wallet count must be clearly distinguished.

## Risk alert

```text
⚠️ RISK CHANGE

$ABC

Creator activity changed.
Liquidity fell 17%.

Radar 81 → 59

[VIEW TOKEN]
```

## Settings

User configurable:
- minimum MC
- maximum MC
- minimum liquidity
- minimum score
- minimum confidence
- convergence window
- minimum convergence entities
- alert cooldown
- X enabled
- FOMO enabled
- wallet alerts
- risk alerts
- quiet hours

## UX principle

Do not send a wall of numbers.

First message:
- what happened
- why it matters
- score
- confidence
- top signals
- top risks

Buttons expose deeper detail.
