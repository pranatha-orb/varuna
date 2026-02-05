# Varuna Demo Scenario

## Overview

Demo ini menunjukkan bagaimana Varuna melindungi DeFi agent dari liquidation sambil memaksimalkan yield. Total durasi: ~5 menit.

---

## Scene 1: The Problem (30 detik)

### Narasi
> "Meet Alex, a DeFi yield agent. Alex borrowed $10,000 USDC against $15,000 SOL collateral on Kamino. Health factor: 1.5 — looks safe, right?
>
> Then SOL drops 20% in 2 hours. Health factor crashes to 1.05. Liquidation bots are circling. Alex is about to lose 5% of his collateral to liquidation penalty.
>
> This happens every day. $1.2B liquidated on Solana in 2025. Most agents don't survive their first flash crash."

### Visual
```
BEFORE CRASH:
┌─────────────────────────────────────┐
│  Collateral: $15,000 SOL            │
│  Debt: $10,000 USDC                 │
│  Health Factor: 1.50 ✅ SAFE        │
└─────────────────────────────────────┘

AFTER 20% SOL DROP:
┌─────────────────────────────────────┐
│  Collateral: $12,000 SOL            │
│  Debt: $10,000 USDC                 │
│  Health Factor: 1.05 🚨 DANGER      │
│                                     │
│  ⚠️ LIQUIDATION IN PROGRESS...      │
│  Lost: $600 (5% penalty)            │
└─────────────────────────────────────┘
```

---

## Scene 2: Enter Varuna (30 detik)

### Narasi
> "This is why we built Varuna — the autonomous risk layer for Solana DeFi agents.
>
> 3 lines of code. That's all it takes."

### Live Code Demo
```typescript
import { Varuna } from '@varuna/sdk';

const guardian = new Varuna({
  wallet: agentWallet,
  protocols: ['kamino', 'marginfi', 'solend'],
  strategy: { autonomy: 'full-auto', yieldAwareProtection: true }
});

await guardian.start();
// Done. Your agent is now protected 24/7.
```

### Visual
```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██╗   ██╗ █████╗ ██████╗ ██╗   ██╗███╗   ██╗ █████╗    ║
║   ██║   ██║██╔══██╗██╔══██╗██║   ██║████╗  ██║██╔══██╗   ║
║   ██║   ██║███████║██████╔╝██║   ██║██╔██╗ ██║███████║   ║
║   ╚██╗ ██╔╝██╔══██║██╔══██╗██║   ██║██║╚██╗██║██╔══██║   ║
║    ╚████╔╝ ██║  ██║██║  ██║╚██████╔╝██║ ╚████║██║  ██║   ║
║     ╚═══╝  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝   ║
║                                                           ║
║          DeFi Liquidation Protection for Solana           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

[Varuna] Guardian started for 7xKp...3nYd
[Varuna] Mode: full-auto | Protocols: kamino, marginfi, solend
[Varuna] Monitoring every 30 seconds...
```

---

## Scene 3: Real-Time Risk Assessment (1 menit)

### Narasi
> "Varuna doesn't just check health factor. It analyzes 5 risk factors with smart weighting."

### API Call
```bash
curl http://localhost:3000/api/risk/DEMO_WALLET
```

### Expected Output
```json
{
  "wallet": "7xKpQ...3nYd",
  "overallRiskLevel": "high",
  "overallRiskScore": 72,
  "positions": [
    {
      "protocol": "kamino",
      "riskLevel": "high",
      "riskScore": 75,
      "healthFactor": 1.18,
      "factors": [
        {
          "name": "health_factor",
          "score": 82,
          "weight": 0.45,
          "detail": "Health factor 1.180 (critical<1.1)"
        },
        {
          "name": "utilization",
          "score": 68,
          "weight": 0.15,
          "detail": "Utilization 72.5% ($10,000 / $13,800)"
        },
        {
          "name": "concentration",
          "score": 40,
          "weight": 0.10,
          "detail": "Single collateral asset (SOL)"
        },
        {
          "name": "trend",
          "score": 75,
          "weight": 0.20,
          "detail": "Rapid decline: -0.025/min — est. 7min to liquidation"
        },
        {
          "name": "protocol_risk",
          "score": 0,
          "weight": 0.10,
          "detail": "Kamino: standard parameters"
        }
      ],
      "recommendations": [
        {
          "action": "repay",
          "urgency": "immediate",
          "amount": 2300,
          "reason": "Repay $2,300 to restore health factor to 1.5"
        }
      ]
    }
  ]
}
```

### Highlight Points
- **5 Risk Factors**: health_factor (45%), trend (20%), utilization (15%), concentration (10%), protocol_risk (10%)
- **Trend Detection**: "Rapid decline: -0.025/min — est. 7min to liquidation"
- **Position-Size Scaling**: Larger positions get tighter thresholds
- **Smart Recommendations**: Calculates exact repay amount needed

---

## Scene 4: Yield-Aware Protection (1.5 menit)

### Narasi
> "Here's what makes Varuna different. Most protection tools just dump your collateral. Varuna calculates the YIELD IMPACT of each option and picks the one that costs you least."

### API Call
```bash
curl http://localhost:3000/api/protect/DEMO_WALLET/kamino
```

### Expected Output
```json
{
  "options": [
    {
      "id": "repay-kamino",
      "action": "repay",
      "amount": 2300,
      "resultingHF": 1.52,
      "yieldImpact": {
        "currentAPY": 0.105,
        "projectedAPY": 0.092,
        "yieldDeltaPercent": -12.4,
        "annualizedCostUsd": -180
      },
      "capitalCostUsd": 2300,
      "yieldCostAnnualUsd": -180,
      "totalScoreUsd": 2120,
      "reason": "Repay $2,300 debt to restore HF to 1.52"
    },
    {
      "id": "add-collateral-kamino",
      "action": "add-collateral",
      "amount": 2800,
      "resultingHF": 1.51,
      "yieldImpact": {
        "currentAPY": 0.105,
        "projectedAPY": 0.098,
        "yieldDeltaPercent": -6.7,
        "annualizedCostUsd": -95
      },
      "capitalCostUsd": 2800,
      "yieldCostAnnualUsd": -95,
      "totalScoreUsd": 2705,
      "reason": "Add $2,800 collateral to restore HF to 1.51"
    },
    {
      "id": "unwind-kamino",
      "action": "unwind",
      "amount": 1380,
      "resultingHF": 1.48,
      "yieldImpact": {
        "currentAPY": 0.105,
        "projectedAPY": 0.078,
        "yieldDeltaPercent": -25.7,
        "annualizedCostUsd": 0
      },
      "capitalCostUsd": 0,
      "yieldCostAnnualUsd": 0,
      "totalScoreUsd": 0,
      "reason": "Unwind: repay $1,380 + withdraw $1,104 to reach HF 1.48"
    }
  ],
  "selectedOption": "repay-kamino",
  "selectionReason": "Lowest yield-adjusted cost while restoring safety"
}
```

### Visual Comparison
```
┌─────────────────────────────────────────────────────────────────┐
│  PROTECTION OPTIONS COMPARISON                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Option A: REPAY $2,300 ⭐ SELECTED                             │
│  ├─ Capital needed: $2,300                                      │
│  ├─ New HF: 1.52 ✅                                             │
│  ├─ APY change: 10.5% → 9.2% (-12.4%)                          │
│  └─ Yield cost: -$180/year (you SAVE money on borrow interest) │
│                                                                 │
│  Option B: ADD COLLATERAL $2,800                                │
│  ├─ Capital needed: $2,800 (more!)                              │
│  ├─ New HF: 1.51 ✅                                             │
│  ├─ APY change: 10.5% → 9.8% (-6.7%)                           │
│  └─ Yield cost: -$95/year                                       │
│                                                                 │
│  Option C: UNWIND (partial deleverage)                          │
│  ├─ Capital needed: $0 (uses existing position)                 │
│  ├─ New HF: 1.48 ✅                                             │
│  ├─ APY change: 10.5% → 7.8% (-25.7%)                          │
│  └─ Yield cost: $0 capital, but -2.7% APY forever              │
│                                                                 │
│  ───────────────────────────────────────────────────────────    │
│  WINNER: Option A — Lowest total cost ($2,120 vs $2,705 vs APY) │
│  "Dumb" tools would pick Option C (no capital). Varuna is smart.│
└─────────────────────────────────────────────────────────────────┘
```

### Key Points
- **3 Protection Strategies**: repay, add-collateral, unwind
- **Yield Impact Calculation**: Shows APY before/after
- **Smart Ranking**: yield-optimized, cost-optimized, speed-optimized
- **Why This Matters**: "Dumb" protection costs you 2.7% APY forever. Varuna saves you $180/year.

---

## Scene 5: Auto-Protection Execution (30 detik)

### Narasi
> "In full-auto mode, Varuna executes the protection transaction autonomously."

### API Call (or automatic trigger)
```bash
curl -X POST http://localhost:3000/api/protect/DEMO_WALLET/kamino
```

### Expected Output
```json
{
  "success": true,
  "option": {
    "action": "repay",
    "amount": 2300,
    "resultingHF": 1.52
  },
  "txSignature": "5xYp...7nKd",
  "executionTimeMs": 1847,
  "previousHF": 1.18,
  "newHF": 1.52,
  "dryRun": false
}
```

### Console Output
```
[Varuna] 🚨 ALERT: Health factor 1.18 below threshold 1.2
[Varuna] Risk assessment: HIGH (score: 75)
[Varuna] Evaluating protection options...
[Varuna] Protection selected: repay on kamino
[Varuna]   Amount: $2,300.00
[Varuna]   HF: 1.180 → 1.520
[Varuna]   Yield: 10.50% → 9.20%
[Varuna]   Yield cost: -$180.00/year (savings!)
[Varuna] ✅ Protection executed: 5xYp...7nKd
[Varuna] Position saved. No liquidation.
```

---

## Scene 6: Collateral Yield Optimization (45 detik)

### Narasi
> "Protection is just half the story. Varuna also analyzes your collateral and recommends yield optimizations."

### API Call
```bash
curl http://localhost:3000/api/collateral/DEMO_WALLET
```

### Expected Output
```json
{
  "wallet": "7xKp...3nYd",
  "analyses": [
    {
      "protocol": "kamino",
      "currentCollateral": [
        {
          "asset": "SOL",
          "amount": 100,
          "valueUsd": 13800,
          "currentYield": 0.05,
          "isLST": false
        }
      ],
      "recommendations": [
        {
          "action": "swap",
          "fromAsset": "SOL",
          "toAsset": "mSOL",
          "amount": 100,
          "valueUsd": 13800,
          "currentYield": 0.05,
          "projectedYield": 0.085,
          "yieldBoostPercent": 70,
          "annualGainUsd": 483,
          "safetyCheck": {
            "currentHF": 1.52,
            "projectedHF": 1.51,
            "safe": true
          },
          "reason": "Swap SOL → mSOL for +70% yield boost (+$483/year)"
        }
      ],
      "totalPotentialGainUsd": 483
    }
  ],
  "summary": {
    "currentAnnualYield": 690,
    "potentialAnnualYield": 1173,
    "totalBoostPercent": 70,
    "totalPotentialGainUsd": 483
  }
}
```

### Visual
```
┌─────────────────────────────────────────────────────────────────┐
│  COLLATERAL YIELD ANALYSIS                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Current: 100 SOL ($13,800) earning 5.0% = $690/year           │
│                                                                 │
│  RECOMMENDATIONS:                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Swap SOL → mSOL                                        │   │
│  │  ├─ Current yield: 5.0%                                 │   │
│  │  ├─ mSOL yield: 8.5%                                    │   │
│  │  ├─ Boost: +70% 🚀                                      │   │
│  │  ├─ Extra earnings: +$483/year                          │   │
│  │  └─ Safety check: HF stays 1.51 ✅                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Other LST options:                                             │
│  • JitoSOL: 7.2% (+44%, +$304/year)                            │
│  • bSOL: 6.8% (+36%, +$248/year)                               │
│  • stSOL: 6.5% (+30%, +$207/year)                              │
│                                                                 │
│  ═══════════════════════════════════════════════════════════   │
│  SUMMARY: Switch to mSOL for +$483/year with same risk level   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scene 7: Real-Time Liquidation Feed (30 detik)

### Narasi
> "Varuna also provides ecosystem-wide liquidation intelligence. See every liquidation on Kamino, MarginFi, and Solend in real-time."

### WebSocket Demo
```bash
wscat -c ws://localhost:3000/ws
> {"action":"subscribe","channel":"liquidations"}
```

### Stream Output
```json
{"type":"liquidation","data":{"protocol":"kamino","wallet":"3xYz...","collateralSeized":"45.2 SOL","debtRepaid":"5,200 USDC","liquidator":"MEV Bot #7","timestamp":"2026-02-05T12:34:56Z"}}
{"type":"liquidation","data":{"protocol":"marginfi","wallet":"9aKl...","collateralSeized":"12,500 USDC","debtRepaid":"10,000 USDC","liquidator":"Jito Bundle","timestamp":"2026-02-05T12:35:02Z"}}
```

### Stats API
```bash
curl http://localhost:3000/api/liquidations/stats
```

```json
{
  "last24h": {
    "count": 847,
    "totalValueUsd": 2340000,
    "byProtocol": {
      "kamino": { "count": 412, "valueUsd": 1200000 },
      "marginfi": { "count": 298, "valueUsd": 890000 },
      "solend": { "count": 137, "valueUsd": 250000 }
    }
  },
  "topLiquidators": [
    { "address": "MEVBot7x...", "count": 156, "valueUsd": 450000 },
    { "address": "JitoBundle...", "count": 89, "valueUsd": 320000 }
  ]
}
```

---

## Scene 8: SDK Event System (30 detik)

### Narasi
> "For agent developers, Varuna's SDK provides a rich event system. React to risk changes, protection events, and more."

### Code Example
```typescript
const guardian = new Varuna({
  wallet: agentWallet,
  protocols: ['kamino'],
  strategy: { autonomy: 'approve' }
});

// React to risk changes
guardian.on('check', ({ positions, risk }) => {
  console.log(`Health: ${positions[0].healthFactor}, Risk: ${risk.overallRiskLevel}`);
});

// Get notified before protection
guardian.on('protection', async ({ options, selectedOption, approve }) => {
  console.log(`Protection needed: ${selectedOption.action} $${selectedOption.amount}`);

  // In 'approve' mode, agent decides
  if (shouldApprove(selectedOption)) {
    const result = await approve();
    console.log(`Executed: ${result.txSignature}`);
  }
});

// Handle errors gracefully
guardian.on('error', ({ error, context }) => {
  alertOps(`Varuna error in ${context}: ${error.message}`);
});

await guardian.start();
```

---

## Scene 9: The Punchline (30 detik)

### Before vs After
```
WITHOUT VARUNA:
┌────────────────────────────────────────┐
│  Position: $15,000 collateral          │
│  Health drops to 1.05                  │
│  → Liquidated                          │
│  → Lost $750 (5% penalty)              │
│  → Lost yield opportunity              │
│  → Agent reputation damaged            │
└────────────────────────────────────────┘

WITH VARUNA:
┌────────────────────────────────────────┐
│  Position: $15,000 collateral          │
│  Health drops to 1.18                  │
│  → Varuna detects risk (5 factors)     │
│  → Evaluates 3 protection options      │
│  → Picks yield-optimal: repay $2,300   │
│  → Auto-executes in 1.8 seconds        │
│  → Position saved, $750 NOT lost       │
│  → Still earning 9.2% APY              │
│  → Collateral optimized: +$483/year    │
└────────────────────────────────────────┘

TOTAL VALUE: $750 saved + $483/year extra yield
ROI: Infinite (Varuna is free during hackathon)
```

### Closing
> "Varuna: The AI Risk Engine That Makes DeFi Agents Earn More and Never Get Liquidated.
>
> 3 lines of code. 24/7 protection. Yield-optimized decisions.
>
> Try it: github.com/pranatha-orb/varuna"

---

## Demo Checklist

### Prerequisites
- [ ] Varuna server running (`npm run build && node dist/index.js`)
- [ ] Test wallet with positions (or mock data)
- [ ] Terminal with good font size for recording
- [ ] wscat installed for WebSocket demo

### API Endpoints to Demo
1. `GET /api/risk/:wallet` — Risk assessment
2. `GET /api/protect/:wallet/:protocol` — Protection options
3. `POST /api/protect/:wallet/:protocol` — Execute protection
4. `GET /api/collateral/:wallet` — Yield analysis
5. `GET /api/liquidations/stats` — Liquidation stats
6. `WS /ws` — Real-time alerts

### Key Numbers to Highlight
- **5 risk factors** with smart weighting
- **3 protection strategies** (repay, add-collateral, unwind)
- **70% yield boost** from collateral optimization
- **$750 saved** per avoided liquidation
- **1.8 seconds** execution time
- **3 lines** of SDK code

---

## Mock Data for Demo

If no real wallet available, use these mock responses:

### Mock Wallet
```
Address: 7xKpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd
Protocol: kamino
Collateral: 100 SOL ($13,800)
Debt: 10,000 USDC
Health Factor: 1.18 (simulated drop)
```

### Environment Setup
```bash
# In .env
DEMO_MODE=true
MOCK_HEALTH_FACTOR=1.18
MOCK_COLLATERAL_USD=13800
MOCK_DEBT_USD=10000
```
