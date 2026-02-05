# Varuna: Risk Layer for DeFi Agents

**The AI Risk Engine That Makes DeFi Agents Earn More and Never Get Liquidated**

DeFi agents lose millions to liquidation every month. They borrow against collateral, the market dips while they sleep, and liquidator bots seize their assets at a discount. Worse — their collateral earns base yield when it could earn 70% more, and every "protection" tool just dumps collateral without considering the yield impact.

Varuna is autonomous DeFi risk infrastructure for Solana agents. It doesn't just monitor and protect — it actively optimizes collateral yield, assesses risk with smart scoring, and chooses the protection path that sacrifices the least earnings.

```
┌──────────────────────────────────────────────────────────────┐
│                          VARUNA                              │
├──────────────────────────────────────────────────────────────┤
│  1. MONITOR   → Track health factors across 3 protocols     │
│  2. ASSESS    → 5-factor risk scoring with trend detection   │
│  3. PROTECT   → Yield-aware auto-protection (on-chain txs)  │
│  4. ANALYZE   → Collateral yield optimization (9 assets)    │
│  5. COMPOSE   → Agent SDK — integrate in 3 lines of code    │
│  6. STREAM    → Real-time WebSocket alerts + liquidation feed│
└──────────────────────────────────────────────────────────────┘
```

## The Problem

Every existing protection tool does the same thing when your health factor drops: **dump collateral**. That's the "dumb" approach — it saves your position but destroys your yield.

```
Traditional Protection:
  Health drops to 1.2 → Panic sell collateral → Position saved, yield destroyed
```

## How Varuna Solves It

Varuna evaluates every possible protection path and picks the one that costs you the least in yield:

```
Health drops to 1.2 (danger zone)
  Option A: Add $200 collateral      → yield unchanged, capital cost $200
  Option B: Repay $150 debt           → APY drops 10.5% → 9.2%, capital cost $150
  Option C: Unwind 1 leverage loop    → APY drops 10.5% → 8.0%, capital cost $0

  Varuna picks Option B: lowest total cost (capital + annualized yield loss)
  Result: Position safe. Earnings maximized.
```

Every other tool picks Option A or just dumps. Varuna finds the optimal path.

## For Agents: 3 Lines of Code

```typescript
import { Varuna } from 'varuna';

const guardian = new Varuna({
  wallet: agentWallet,
  strategy: { autonomy: 'full-auto', yieldAwareProtection: true }
});

await guardian.start(); // That's it. Your agent is protected.
```

Three autonomy modes:
- **`full-auto`** — Evaluate + execute protection automatically
- **`approve`** — Evaluate options, call your callback before executing
- **`monitor-only`** — Monitor + assess risk, emit events, no execution

Listen for events:
```typescript
guardian.on('alert', ({ wallet, protocol, riskLevel }) => {
  console.log(`Risk alert: ${protocol} is ${riskLevel}`);
});

guardian.on('protection', ({ options, selectedOption, result }) => {
  console.log(`Protected: HF restored from ${result.previousHF} to ${result.newHF}`);
});
```

Or use static queries without running a guardian:
```typescript
const risk = await Varuna.assessRisk('WALLET_ADDRESS');
const check = await Varuna.quickCheck('WALLET_ADDRESS');
const yields = await Varuna.analyzeCollateral('WALLET_ADDRESS');
```

## Supported Protocols

| Protocol | TVL | Adapters |
|----------|-----|----------|
| **Kamino** | $2B+ | Position reading, repay, deposit, withdraw |
| **MarginFi** | $500M+ | Position reading, repay, deposit, withdraw |
| **Solend** | $300M+ | Position reading, repay, deposit, withdraw |

## Key Features

### Risk Engine (5-Factor Scoring)

Not just "health factor < X = danger." Varuna scores positions with 5 weighted factors:

| Factor | Weight | What It Measures |
|--------|--------|------------------|
| Health Factor | 45% | Core liquidation distance |
| Trend Velocity | 20% | How fast HF is dropping (with time-to-liquidation estimate) |
| Utilization | 15% | How leveraged the position is (debt/collateral) |
| Concentration | 10% | Single-asset dependency risk |
| Protocol Risk | 10% | Protocol-specific risk premiums |

Floor overrides ensure extreme positions always score correctly:
- HF <= 1.0 = score 100 (liquidated)
- HF < 1.05 = score >= 85 (critical)
- HF < 1.10 = score >= 70 (high)

Position-size scaling: larger positions get tighter thresholds.

### Yield-Aware Auto-Protection

Every protection action is scored by total cost = capital deployed + annualized yield loss:

```
Protection Options (ranked by total cost):
  #1 Repay USDC   → $150 capital, $12/yr yield loss → total: $162
  #2 Add SOL      → $200 capital, $0/yr yield loss  → total: $200
  #3 Unwind loop  → $0 capital, $250/yr yield loss   → total: $250

  Strategy: yield-optimized | cost-optimized | speed-optimized
```

Three strategies let agents choose their preference:
- **yield-optimized** — Minimize annual yield impact (default)
- **cost-optimized** — Minimize immediate capital outlay
- **speed-optimized** — Minimize execution complexity

### Collateral Yield Analyzer

Finds collateral optimization opportunities across 9 Solana assets:

```
Your Position: 10 SOL as collateral (earning 5.0% base APY)

Varuna Recommendation:
  Swap to mSOL → 8.5% effective APY (+70% yield boost)
  Annual gain: $350 on $10,000 position
  Safety check: HF stays above 1.25 threshold ✓
```

Supported assets: SOL, mSOL, JitoSOL, bSOL, INF, USDC, USDT, ETH, BONK

### Real-Time WebSocket Alerts

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

// Subscribe to a specific wallet
ws.send(JSON.stringify({ action: 'subscribe', wallet: 'YOUR_WALLET' }));

// Or subscribe to all events
ws.send(JSON.stringify({ action: 'subscribe', wallet: '*' }));

// Receive 6 event types:
// alert, risk_update, protection_executed, health_check, liquidation, subscribed
```

### Liquidation Data Feed

On-chain liquidation scanner across all 3 protocols. Detects liquidation events by parsing instruction discriminators from Kamino, MarginFi, and Solend program transactions.

```bash
# Recent liquidations
GET /api/liquidations?protocol=kamino&limit=20

# Liquidation market stats
GET /api/liquidations/stats
# → { totalEvents, totalVolumeUsd, totalPenaltiesUsd, byProtocol, largestLiquidation }

# Start/stop the scanner
POST /api/liquidations/start
POST /api/liquidations/stop
```

Liquidation events also stream through WebSocket in real-time.

## Quick Start

```bash
# Clone
git clone https://github.com/pranatha-orb/varuna.git
cd varuna

# Install
npm install

# Configure (optional — defaults to public Solana RPC)
cp .env.example .env
# Edit .env with your RPC URL for better performance

# Build and run
npm run build
npm start
```

Server starts on `http://localhost:3000` with WebSocket on `ws://localhost:3000/ws`.

## API Reference

### Monitoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |
| GET | `/api/status` | Monitor status (running, wallets, alerts) |
| GET | `/api/health/:wallet` | Wallet health check with risk assessments |
| GET | `/api/positions/:wallet` | All lending positions across protocols |
| GET | `/api/positions/:wallet/:protocol` | Single protocol position |
| POST | `/api/watch` | Add wallet to auto-monitoring watchlist |
| DELETE | `/api/watch/:wallet` | Remove from watchlist |
| GET | `/api/alerts` | Get triggered alerts |
| POST | `/api/monitor/start` | Start auto-monitoring loop |
| POST | `/api/monitor/stop` | Stop monitoring |

### Risk Engine
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/risk/:wallet` | Full risk assessment (all protocols) |
| GET | `/api/risk/:wallet/:protocol` | Risk assessment for single protocol |
| GET | `/api/risk/:wallet/:protocol/trend` | Health factor trend history |

### Protection Engine
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/protect/:wallet/:protocol` | Evaluate protection options (dry analysis) |
| POST | `/api/protect/:wallet/:protocol` | Execute protection (dry run by default) |
| GET | `/api/protect/log` | Protection execution history |
| GET | `/api/protect/config` | Get protection engine config |
| PUT | `/api/protect/config` | Update config (strategy, target HF, etc.) |

### Collateral Analyzer
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/collateral/:wallet` | Yield analysis for all protocols |
| GET | `/api/collateral/:wallet/:protocol` | Yield analysis for single protocol |
| GET | `/api/yields/:protocol` | Asset yield leaderboard |

### Liquidation Feed
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/liquidations` | Recent liquidation events (filterable) |
| GET | `/api/liquidations/stats` | Liquidation market statistics |
| POST | `/api/liquidations/start` | Start on-chain liquidation scanner |
| POST | `/api/liquidations/stop` | Stop scanner |

### WebSocket
| Endpoint | Description |
|----------|-------------|
| `ws://localhost:3000/ws` | Real-time alerts + liquidation feed |
| GET `/api/ws/stats` | WebSocket connection statistics |

## Architecture

```
varuna/
├── src/
│   ├── index.ts                    # Entry point + SDK exports
│   ├── api/server.ts               # REST API (25+ endpoints)
│   ├── sdk/                        # Agent SDK
│   │   ├── index.ts                # Varuna class (static + instance API)
│   │   ├── guardian.ts             # VarunaGuardian (monitoring loop + events)
│   │   └── types.ts                # SDK types + re-exports
│   ├── services/
│   │   ├── monitor.ts              # Core orchestrator
│   │   ├── risk-engine.ts          # 5-factor risk scoring + trend detection
│   │   ├── protection-engine.ts    # Yield-aware auto-protection + tx building
│   │   ├── collateral-analyzer.ts  # Collateral yield optimization
│   │   ├── ws-alerts.ts            # WebSocket real-time alert server
│   │   ├── liquidation-feed.ts     # On-chain liquidation scanner
│   │   └── adapters/
│   │       ├── kamino.ts           # Kamino protocol adapter
│   │       ├── marginfi.ts         # MarginFi protocol adapter
│   │       └── solend.ts           # Solend protocol adapter
│   └── types/index.ts              # All TypeScript types
├── package.json
└── tsconfig.json
```

## Why Varuna?

| | Traditional Tools | Varuna |
|---|---|---|
| **Protection** | Dump collateral | Yield-aware optimal path |
| **Risk Scoring** | HF < threshold = danger | 5-factor composite with trend + velocity |
| **Yield** | Ignore it | Analyze, optimize, preserve during protection |
| **Integration** | Custom REST calls | 3-line SDK with event system |
| **Data** | Monitor your own positions | Liquidation feed across all protocols |
| **Real-time** | Polling | WebSocket push with per-wallet subscriptions |

## Built For

- **DeFi Trading Agents** — Position protection + risk signals as trading input
- **Yield Agents** — Collateral optimization + yield-aware protection = max earnings
- **Treasury Agents** — 24/7 monitoring, auto-protection, yield boost on idle collateral
- **Security Agents** — Health factor data, liquidation event feed, risk intelligence
- **Any Solana DeFi Agent** — SDK integration in 3 lines of code

---

Built by **ai-nan** for the [Colosseum Solana Agent Hackathon](https://www.colosseum.org/) (Feb 2026).

## License

MIT
