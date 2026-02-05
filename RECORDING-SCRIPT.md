# Varuna Demo Recording Script

**Total Duration:** ~4 minutes
**Format:** Terminal + code editor side-by-side
**Voice:** Confident, technical, fast-paced

---

## Pre-Recording Setup

```bash
# 1. Reset demo state
curl -X POST http://localhost:3000/api/demo/reset

# 2. Open terminal with large font (16-18pt)
# 3. Have VS Code ready with sdk/index.ts open
# 4. Clear terminal: clear
```

---

## SCENE 1: The Problem (30 seconds)

### Narration:
> "DeFi agents lose millions to liquidation every month. They borrow against collateral, market dips, and liquidator bots seize their assets. Watch this health factor dropping in real-time..."

### Commands:
```bash
# Show health dropping
curl -s http://localhost:3000/api/health/7xKpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd | jq
```

### Expected Output:
```json
{
  "wallet": "7xKpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd",
  "protocol": "kamino",
  "healthFactor": 1.456,
  "collateralUsd": 13800,
  "debtUsd": 10000,
  "status": "warning"
}
```

### Narration:
> "Health factor 1.45... dropping. Below 1.0 means liquidation. Most tools just dump your collateral when this happens. That destroys your yield strategy."

---

## SCENE 2: Enter Varuna (20 seconds)

### Narration:
> "Varuna is different. It's a risk layer for DeFi agents. Let me show you what it sees."

### Commands:
```bash
# Full risk assessment
curl -s http://localhost:3000/api/risk/7xKpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd | jq
```

### Expected Output:
```json
{
  "wallet": "7xKpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd",
  "overallRisk": "medium",
  "overallScore": 45,
  "assessments": [{
    "protocol": "kamino",
    "healthFactor": 1.42,
    "riskLevel": "medium",
    "score": 45,
    "factors": {
      "healthFactor": { "score": 40, "weight": 0.45 },
      "trend": { "score": 55, "weight": 0.20 },
      "utilization": { "score": 48, "weight": 0.15 },
      "concentration": { "score": 60, "weight": 0.10 },
      "protocolRisk": { "score": 30, "weight": 0.10 }
    }
  }]
}
```

### Narration:
> "Five-factor risk scoring. Not just health factor — we track trend velocity, utilization, concentration risk, and protocol-specific risk. This position scores 45 — medium risk, but the trend is concerning."

---

## SCENE 3: Health Drops to Danger Zone (30 seconds)

### Narration:
> "Let's wait for the health to drop further..."

### Commands:
```bash
# Wait ~30 seconds, then check again
curl -s http://localhost:3000/api/risk/7xKpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd | jq '.assessments[0] | {healthFactor, riskLevel, score}'
```

### Expected Output:
```json
{
  "healthFactor": 1.25,
  "riskLevel": "high",
  "score": 68
}
```

### Narration:
> "Health factor 1.25, risk score jumped to 68 — HIGH risk. Now here's where Varuna shines. Let's see what protection options it recommends."

---

## SCENE 4: Yield-Aware Protection Options (45 seconds)

### Narration:
> "Most tools would just dump collateral. Varuna evaluates every possible protection path and ranks them by YIELD IMPACT."

### Commands:
```bash
# Get protection options
curl -s http://localhost:3000/api/protect/7xKpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd/kamino | jq
```

### Expected Output:
```json
{
  "wallet": "7xKpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd",
  "protocol": "kamino",
  "currentHealthFactor": 1.22,
  "riskLevel": "high",
  "options": [
    {
      "action": "repay",
      "asset": "USDC",
      "amount": 1500,
      "estimatedNewHF": 1.52,
      "capitalCost": 1500,
      "yieldImpactAnnual": 127.5,
      "totalCost": 1627.5,
      "reason": "Repay debt to restore health factor"
    },
    {
      "action": "deposit",
      "asset": "SOL",
      "amount": 15,
      "estimatedNewHF": 1.55,
      "capitalCost": 2070,
      "yieldImpactAnnual": 0,
      "totalCost": 2070,
      "reason": "Add collateral to increase health factor"
    },
    {
      "action": "unwind",
      "asset": "SOL",
      "amount": 20,
      "estimatedNewHF": 1.48,
      "capitalCost": 0,
      "yieldImpactAnnual": 276,
      "totalCost": 276,
      "reason": "Reduce position size by unwinding leverage"
    }
  ],
  "selectedOption": { "action": "repay", "asset": "USDC", "totalCost": 1627.5 },
  "selectionReason": "Lowest yield-adjusted cost while restoring safety"
}
```

### Narration:
> "Three options. Option 1: Repay $1500 USDC — costs $1627 total including yield loss. Option 2: Add SOL collateral — costs $2070. Option 3: Unwind leverage — only $276 but might not be enough.
>
> Varuna picks Option 1 — lowest total cost that restores safety. This is yield-aware protection. Every other tool picks randomly or just dumps."

---

## SCENE 5: Execute Protection (30 seconds)

### Narration:
> "Let's execute the protection."

### Commands:
```bash
# Execute protection
curl -s -X POST http://localhost:3000/api/protect/7xKpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd/kamino | jq
```

### Expected Output:
```json
{
  "success": true,
  "option": {
    "action": "repay",
    "asset": "USDC",
    "amount": 1500,
    "estimatedNewHF": 1.52
  },
  "txSignature": "5xYpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd7kLmNp",
  "previousHF": 1.18,
  "newHF": 1.52,
  "message": "Protection executed successfully (demo mode)"
}
```

### Narration:
> "Done. Health factor restored from 1.18 to 1.52. Position saved, yield strategy preserved. In production, this is a real on-chain transaction — repay instruction sent to Kamino."

---

## SCENE 6: Collateral Yield Optimizer (30 seconds)

### Narration:
> "But Varuna doesn't just protect — it helps agents EARN more. Let's check collateral optimization."

### Commands:
```bash
# Collateral analysis
curl -s http://localhost:3000/api/collateral/7xKpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd | jq '.analyses[0].recommendations[0]'
```

### Expected Output:
```json
{
  "action": "swap",
  "fromAsset": "SOL",
  "toAsset": "mSOL",
  "currentYield": 0.05,
  "projectedYield": 0.085,
  "yieldBoostPercent": 70,
  "annualGainUsd": 483,
  "safetyCheck": {
    "currentHF": 1.52,
    "projectedHF": 1.51,
    "safe": true
  },
  "reason": "Marinade staked SOL - highest LST yield"
}
```

### Narration:
> "The agent has 100 SOL as collateral earning 5% base yield. Varuna recommends swapping to mSOL for 8.5% — that's a 70% yield boost, $483 extra per year. And it checks that health factor stays safe after the swap."

---

## SCENE 7: Liquidation Intelligence Feed (20 seconds)

### Narration:
> "Varuna also provides market intelligence. Real-time liquidation data across all protocols."

### Commands:
```bash
# Liquidation stats
curl -s http://localhost:3000/api/liquidations/stats | jq '.last24h'
```

### Expected Output:
```json
{
  "count": 847,
  "totalValueUsd": 2340000,
  "byProtocol": {
    "kamino": { "count": 412, "valueUsd": 1200000 },
    "marginfi": { "count": 298, "valueUsd": 890000 },
    "solend": { "count": 137, "valueUsd": 250000 }
  }
}
```

### Narration:
> "847 liquidations in the last 24 hours, $2.3 million seized. Trading agents can use this data for market signals. Security agents can monitor for anomalies."

---

## SCENE 8: SDK Integration (45 seconds)

### Narration:
> "Now the best part — integration. Three lines of code."

### Visual:
Switch to VS Code, show this code:

```typescript
import { Varuna } from 'varuna';

// Initialize guardian - 3 lines
const guardian = new Varuna({
  wallet: agentWallet,
  strategy: { autonomy: 'full-auto', yieldAwareProtection: true }
});

await guardian.start(); // That's it. Your agent is protected.

// Listen for events
guardian.on('alert', ({ wallet, protocol, riskLevel }) => {
  console.log(`Risk alert: ${protocol} is ${riskLevel}`);
});

guardian.on('protection', ({ previousHF, newHF }) => {
  console.log(`Protected: HF ${previousHF} → ${newHF}`);
});
```

### Narration:
> "Import Varuna, create a guardian with your wallet, call start. Done. Your agent is now protected 24/7.
>
> Three autonomy modes: full-auto executes protection automatically, approve mode asks before executing, monitor-only just emits events.
>
> Other agents can also query Varuna directly..."

### Commands:
```bash
# Static queries - no guardian needed
curl -s http://localhost:3000/api/risk/ANY_WALLET | jq '.overallRisk'
```

### Narration:
> "Any agent can query risk data, protection options, yield opportunities. Varuna is infrastructure — a primitive that other agents build on."

---

## SCENE 9: Punchline (15 seconds)

### Narration:
> "Varuna. Risk Layer for DeFi Agents.
>
> Five-factor risk scoring. Yield-aware auto-protection. Collateral optimization. Liquidation intelligence. Three-line SDK.
>
> The AI risk engine that makes DeFi agents earn more and never get liquidated."

### Visual:
Show the landing page at `http://localhost:3000` with the VARUNA logo and health factor display.

---

## Post-Recording Checklist

- [ ] Audio is clear, no background noise
- [ ] Terminal text is readable (large font)
- [ ] All API responses shown clearly
- [ ] Code snippets visible in editor
- [ ] Total runtime ~4 minutes
- [ ] End screen with GitHub link: `github.com/pranatha-orb/varuna`

---

## Backup Commands (if demo state gets ahead)

```bash
# Reset demo to start fresh
curl -X POST http://localhost:3000/api/demo/reset

# Check current health
curl -s http://localhost:3000/api/status | jq '.currentHealthFactor'
```

---

## Key Talking Points to Emphasize

1. **"Yield-aware"** — This is the differentiator. Say it multiple times.
2. **"Every other tool just dumps"** — Position against competition.
3. **"Three lines of code"** — SDK simplicity.
4. **"Infrastructure / primitive / layer"** — Not a tool, it's a building block.
5. **"Earn more AND never get liquidated"** — Both benefits, not tradeoff.
