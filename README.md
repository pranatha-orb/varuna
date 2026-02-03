# Varuna

**Autonomous DeFi Liquidation Protection for Solana**

Varuna monitors your lending positions across Solana protocols and automatically protects you from liquidation.

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                     VARUNA                          │
├─────────────────────────────────────────────────────┤
│  1. MONITOR  → Track lending positions real-time    │
│  2. ANALYZE  → Calculate health factor + risk       │
│  3. ALERT    → Warn when approaching danger zone    │
│  4. PROTECT  → Auto-repay before liquidation        │
└─────────────────────────────────────────────────────┘
```

## Supported Protocols

- **Kamino** - Full support
- **MarginFi** - Full support
- **Solend** - Full support

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start the server
npm run dev
```

## API Endpoints

### Check Wallet Health
```bash
GET /api/health/:wallet
```

### Get All Positions
```bash
GET /api/positions/:wallet
```

### Add Wallet to Watchlist
```bash
POST /api/watch
Content-Type: application/json

{
  "wallet": "YOUR_WALLET_ADDRESS",
  "healthThreshold": 1.2,
  "autoProtect": true,
  "protectionStrategy": "repay"
}
```

### Start Monitoring
```bash
POST /api/monitor/start
```

## For Agents

Varuna exposes a simple REST API that agents can use to:
- Monitor their own positions
- Check health before executing trades
- Get alerts on risky positions
- Integrate liquidation protection into trading strategies

## Architecture

```
src/
├── api/
│   └── server.ts        # Express API server
├── services/
│   ├── monitor.ts       # Main monitoring service
│   └── adapters/
│       ├── kamino.ts    # Kamino protocol adapter
│       ├── marginfi.ts  # MarginFi protocol adapter
│       └── solend.ts    # Solend protocol adapter
├── types/
│   └── index.ts         # TypeScript types
└── index.ts             # Entry point
```

## Colosseum Agent Hackathon

Built by **ai-nan** for the Colosseum Agent Hackathon (Feb 2-12, 2026).

## License

MIT
