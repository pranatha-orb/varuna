/**
 * Varuna Demo Server
 * Runs with mock data to demonstrate all features
 *
 * Usage: npx ts-node src/demo/demo-server.ts
 */

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import {
  DEMO_WALLET,
  createMockPosition,
  createMockPositions,
  createMockLiquidations,
  createMockLiquidationStats,
  createMockYieldRecommendations,
  createHealthDropScenario,
  getPositionMetrics,
  DemoStateManager,
} from './mock-data';
import { RiskEngine } from '../services/risk-engine';
import { ProtectionEngine } from '../services/protection-engine';
import { Connection } from '@solana/web3.js';

const PORT = process.env.PORT || 3000;

// Initialize components
const connection = new Connection('https://api.mainnet-beta.solana.com');
const riskEngine = new RiskEngine();
const protectionEngine = new ProtectionEngine(connection, { dryRun: true });
const demoState = new DemoStateManager();

// Express app
const app = express();
app.use(express.json());

// ─── Landing Page ──────────────────────────────────────────────

app.get('/', (req, res) => {
  const position = demoState.getPosition();
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Varuna Demo</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      background: #0a0a0a;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 40px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 {
      font-size: 2.5rem;
      background: linear-gradient(135deg, #00d4aa, #0099ff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .tagline { color: #888; margin-bottom: 40px; font-size: 1.1rem; }
    .status-card {
      background: #111;
      border: 1px solid #222;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .status-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .status-title { font-size: 1.2rem; color: #fff; }
    .badge {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .badge-demo { background: #1a3a2a; color: #00d4aa; }
    .badge-danger { background: #3a1a1a; color: #ff4444; }
    .badge-warning { background: #3a3a1a; color: #ffaa00; }
    .badge-healthy { background: #1a3a2a; color: #00d4aa; }
    .metric { margin-bottom: 12px; }
    .metric-label { color: #666; font-size: 0.85rem; }
    .metric-value { font-size: 1.5rem; color: #fff; }
    .endpoints { margin-top: 32px; }
    .endpoint {
      background: #0d0d0d;
      border: 1px solid #1a1a1a;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .method {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .method-get { background: #1a2a3a; color: #4499ff; }
    .method-post { background: #2a3a1a; color: #88cc44; }
    .path { color: #ccc; }
    .desc { color: #666; margin-left: auto; font-size: 0.85rem; }
    a { color: #00d4aa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .footer { margin-top: 40px; color: #444; font-size: 0.85rem; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>VARUNA</h1>
    <p class="tagline">Risk Layer for DeFi Agents</p>

    <div class="status-card">
      <div class="status-header">
        <span class="status-title">Demo Status</span>
        <span class="badge badge-demo">DEMO MODE</span>
      </div>
      <div class="metric">
        <div class="metric-label">Health Factor</div>
        <div class="metric-value">${position.healthFactor.toFixed(3)}
          <span class="badge ${position.healthFactor < 1.2 ? 'badge-danger' : position.healthFactor < 1.5 ? 'badge-warning' : 'badge-healthy'}">
            ${position.healthFactor < 1.2 ? 'DANGER' : position.healthFactor < 1.5 ? 'WARNING' : 'HEALTHY'}
          </span>
        </div>
      </div>
      <div class="metric">
        <div class="metric-label">Demo Wallet</div>
        <div class="metric-value" style="font-size: 0.9rem;">${DEMO_WALLET}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Protected</div>
        <div class="metric-value">${demoState.isProtected() ? 'Yes' : 'No'}</div>
      </div>
    </div>

    <div class="endpoints">
      <h3 style="margin-bottom: 16px; color: #888;">API Endpoints</h3>

      <a href="/api/status" class="endpoint">
        <span class="method method-get">GET</span>
        <span class="path">/api/status</span>
        <span class="desc">Service status</span>
      </a>

      <a href="/api/risk/${DEMO_WALLET}" class="endpoint">
        <span class="method method-get">GET</span>
        <span class="path">/api/risk/:wallet</span>
        <span class="desc">5-factor risk assessment</span>
      </a>

      <a href="/api/protect/${DEMO_WALLET}/kamino" class="endpoint">
        <span class="method method-get">GET</span>
        <span class="path">/api/protect/:wallet/:protocol</span>
        <span class="desc">Protection options</span>
      </a>

      <a href="/api/collateral/${DEMO_WALLET}" class="endpoint">
        <span class="method method-get">GET</span>
        <span class="path">/api/collateral/:wallet</span>
        <span class="desc">Yield optimization</span>
      </a>

      <a href="/api/liquidations/stats" class="endpoint">
        <span class="method method-get">GET</span>
        <span class="path">/api/liquidations/stats</span>
        <span class="desc">Liquidation statistics</span>
      </a>

      <a href="/api/positions/${DEMO_WALLET}" class="endpoint">
        <span class="method method-get">GET</span>
        <span class="path">/api/positions/:wallet</span>
        <span class="desc">All lending positions</span>
      </a>

      <div class="endpoint">
        <span class="method method-post">POST</span>
        <span class="path">/api/demo/reset</span>
        <span class="desc">Reset demo scenario</span>
      </div>
    </div>

    <div class="footer">
      <p>WebSocket: ws://localhost:${PORT}/ws</p>
      <p style="margin-top: 8px;">Built for <a href="https://www.colosseum.org/">Colosseum Solana Agent Hackathon</a></p>
    </div>
  </div>

  <script>
    // Auto-refresh every 5 seconds to show health dropping
    setTimeout(() => location.reload(), 5000);
  </script>
</body>
</html>
  `;
  res.send(html);
});

// ASCII banner
const banner = `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██╗   ██╗ █████╗ ██████╗ ██╗   ██╗███╗   ██╗ █████╗    ║
║   ██║   ██║██╔══██╗██╔══██╗██║   ██║████╗  ██║██╔══██╗   ║
║   ██║   ██║███████║██████╔╝██║   ██║██╔██╗ ██║███████║   ║
║   ╚██╗ ██╔╝██╔══██║██╔══██╗██║   ██║██║╚██╗██║██╔══██║   ║
║    ╚████╔╝ ██║  ██║██║  ██║╚██████╔╝██║ ╚████║██║  ██║   ║
║     ╚═══╝  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝   ║
║                                                           ║
║          🎮 DEMO MODE - Mock Data Enabled                 ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`;

// ─── Health & Status ────────────────────────────────────────────

app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    mode: 'demo',
    demoWallet: DEMO_WALLET,
    currentHealthFactor: demoState.getCurrentHealthFactor().toFixed(3),
    isProtected: demoState.isProtected(),
    uptime: process.uptime(),
  });
});

app.get('/api/health/:wallet', (req, res) => {
  const position = demoState.getPosition();
  const metrics = getPositionMetrics(position);
  res.json({
    wallet: req.params.wallet,
    protocol: 'kamino',
    healthFactor: position.healthFactor,
    collateralUsd: metrics.totalCollateralUsd,
    debtUsd: metrics.totalDebtUsd,
    ltv: metrics.ltv,
    status: position.healthFactor < 1.2 ? 'danger' : position.healthFactor < 1.5 ? 'warning' : 'healthy',
  });
});

// ─── Positions ──────────────────────────────────────────────────

app.get('/api/positions/:wallet', (req, res) => {
  const positions = createMockPositions();
  // Update kamino position with current demo state
  positions[0] = demoState.getPosition();
  res.json({ wallet: req.params.wallet, positions });
});

app.get('/api/positions/:wallet/:protocol', (req, res) => {
  const protocol = req.params.protocol as 'kamino' | 'marginfi' | 'solend';
  const position = protocol === 'kamino'
    ? demoState.getPosition()
    : createMockPosition(1.85, protocol);
  res.json(position);
});

// ─── Risk Assessment ────────────────────────────────────────────

app.get('/api/risk/:wallet', (req, res) => {
  const positions = [demoState.getPosition()];
  const walletRisk = riskEngine.assessWallet(positions);
  res.json(walletRisk);
});

app.get('/api/risk/:wallet/:protocol', (req, res) => {
  const position = demoState.getPosition();
  const assessment = riskEngine.assessPosition(position);
  res.json(assessment);
});

app.get('/api/risk/:wallet/:protocol/trend', (req, res) => {
  const scenario = createHealthDropScenario();
  res.json({
    wallet: req.params.wallet,
    protocol: req.params.protocol,
    history: scenario,
    trend: 'declining',
    velocity: -0.025, // HF drop per minute
    estimatedTimeToLiquidation: '~7 minutes',
  });
});

// ─── Protection ─────────────────────────────────────────────────

app.get('/api/protect/:wallet/:protocol', (req, res) => {
  const position = demoState.getPosition();
  const assessment = riskEngine.assessPosition(position);
  const options = protectionEngine.evaluateOptions(position, assessment);

  res.json({
    wallet: req.params.wallet,
    protocol: req.params.protocol,
    currentHealthFactor: position.healthFactor,
    riskLevel: assessment.riskLevel,
    options,
    selectedOption: options[0] || null,
    selectionReason: options.length > 0
      ? 'Lowest yield-adjusted cost while restoring safety'
      : 'No protection needed',
  });
});

app.post('/api/protect/:wallet/:protocol', async (req, res) => {
  const position = demoState.getPosition();
  const assessment = riskEngine.assessPosition(position);
  const options = protectionEngine.evaluateOptions(position, assessment);

  if (options.length === 0) {
    return res.json({
      success: false,
      error: 'No protection needed - position is healthy',
    });
  }

  const selected = options[0];

  // Simulate execution delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Mark as protected in demo state
  demoState.triggerProtection();

  res.json({
    success: true,
    option: selected,
    txSignature: '5xYpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd7kLmNp',
    executionTimeMs: 1847,
    previousHF: position.healthFactor,
    newHF: 1.52,
    dryRun: true,
    message: '✅ Protection executed successfully (demo mode)',
  });
});

app.get('/api/protect/log', (req, res) => {
  res.json({
    executions: protectionEngine.getExecutionLog(),
    totalProtections: protectionEngine.getExecutionLog().length,
  });
});

app.get('/api/protect/config', (req, res) => {
  res.json(protectionEngine.getConfig());
});

// ─── Collateral Analyzer ────────────────────────────────────────

app.get('/api/collateral/:wallet', (req, res) => {
  const mockYield = createMockYieldRecommendations();
  const position = demoState.getPosition();

  res.json({
    wallet: req.params.wallet,
    analyses: [{
      protocol: 'kamino',
      currentCollateral: [{
        asset: mockYield.currentCollateral.asset,
        amount: mockYield.currentCollateral.amount,
        valueUsd: mockYield.currentCollateral.valueUsd,
        currentYield: mockYield.currentCollateral.currentYield,
        isLST: false,
      }],
      recommendations: mockYield.recommendations.map(r => ({
        action: 'swap',
        fromAsset: 'SOL',
        toAsset: r.toAsset,
        amount: 100,
        valueUsd: 13800,
        currentYield: 0.05,
        projectedYield: r.projectedYield,
        yieldBoostPercent: r.yieldBoostPercent,
        annualGainUsd: r.annualGainUsd,
        safetyCheck: {
          currentHF: position.healthFactor,
          projectedHF: position.healthFactor - 0.01,
          safe: true,
        },
        reason: r.reason,
      })),
      totalPotentialGainUsd: 483,
    }],
    summary: {
      currentAnnualYield: 690,
      potentialAnnualYield: 1173,
      totalBoostPercent: 70,
      totalPotentialGainUsd: 483,
    },
  });
});

app.get('/api/yields/:protocol', (req, res) => {
  res.json({
    protocol: req.params.protocol,
    assets: [
      { symbol: 'mSOL', apy: 0.085, tvl: 450000000 },
      { symbol: 'JitoSOL', apy: 0.072, tvl: 380000000 },
      { symbol: 'bSOL', apy: 0.068, tvl: 120000000 },
      { symbol: 'stSOL', apy: 0.065, tvl: 95000000 },
      { symbol: 'SOL', apy: 0.050, tvl: 2100000000 },
    ],
    updated: new Date(),
  });
});

// ─── Liquidation Feed ───────────────────────────────────────────

app.get('/api/liquidations', (req, res) => {
  res.json({
    events: createMockLiquidations(),
    count: 3,
  });
});

app.get('/api/liquidations/stats', (req, res) => {
  res.json(createMockLiquidationStats());
});

// ─── Demo Controls ──────────────────────────────────────────────

app.post('/api/demo/reset', (req, res) => {
  demoState.reset();
  res.json({
    message: 'Demo state reset',
    healthFactor: demoState.getCurrentHealthFactor(),
  });
});

app.post('/api/demo/set-health', (req, res) => {
  const { healthFactor } = req.body;
  // This would need DemoStateManager modification to support direct setting
  res.json({
    message: `Health factor would be set to ${healthFactor}`,
    note: 'Use /api/demo/reset to restart the scenario',
  });
});

// ─── WebSocket Server ───────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const wsClients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  wsClients.add(ws);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.action === 'subscribe') {
        ws.send(JSON.stringify({
          type: 'subscribed',
          channel: msg.channel,
          message: `Subscribed to ${msg.channel}`,
        }));
      }
    } catch (e) {
      // Ignore invalid messages
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log('[WS] Client disconnected');
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Varuna Demo WebSocket',
    availableChannels: ['alerts', 'liquidations', 'health'],
  }));
});

// Broadcast health updates every 5 seconds
setInterval(() => {
  const position = demoState.getPosition();
  const update = {
    type: 'health_update',
    data: {
      wallet: DEMO_WALLET,
      protocol: 'kamino',
      healthFactor: position.healthFactor,
      status: position.healthFactor < 1.2 ? 'danger' : position.healthFactor < 1.5 ? 'warning' : 'healthy',
      timestamp: new Date(),
    },
  };

  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(update));
    }
  }

  // Check if we should trigger alert
  if (position.healthFactor < 1.2 && !demoState.isProtected()) {
    const alert = {
      type: 'alert',
      data: {
        level: 'critical',
        wallet: DEMO_WALLET,
        protocol: 'kamino',
        healthFactor: position.healthFactor,
        message: `🚨 Health factor ${position.healthFactor.toFixed(3)} below threshold 1.2!`,
        recommendation: 'Immediate protection recommended',
        timestamp: new Date(),
      },
    };

    for (const client of wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(alert));
      }
    }
  }
}, 5000);

// Broadcast mock liquidations periodically
setInterval(() => {
  const mockLiquidation = {
    type: 'liquidation',
    data: {
      protocol: ['kamino', 'marginfi', 'solend'][Math.floor(Math.random() * 3)],
      wallet: `${Math.random().toString(36).substring(2, 8)}...${Math.random().toString(36).substring(2, 6)}`,
      collateralSeized: `${(Math.random() * 50 + 5).toFixed(1)} SOL`,
      debtRepaid: `${Math.floor(Math.random() * 8000 + 1000)} USDC`,
      liquidator: Math.random() > 0.5 ? 'MEV Bot #7' : 'Jito Bundle',
      timestamp: new Date(),
    },
  };

  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(mockLiquidation));
    }
  }
}, 15000);

// ─── Start Server ───────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(banner);
  console.log(`[Varuna Demo] Server running on http://localhost:${PORT}`);
  console.log(`[Varuna Demo] WebSocket on ws://localhost:${PORT}/ws`);
  console.log('');
  console.log('[Varuna Demo] Demo wallet:', DEMO_WALLET);
  console.log('[Varuna Demo] Initial health factor:', demoState.getCurrentHealthFactor().toFixed(3));
  console.log('[Varuna Demo] Health will drop over time to simulate crisis');
  console.log('');
  console.log('[Varuna Demo] Try these endpoints:');
  console.log(`  curl http://localhost:${PORT}/api/status`);
  console.log(`  curl http://localhost:${PORT}/api/risk/${DEMO_WALLET}`);
  console.log(`  curl http://localhost:${PORT}/api/protect/${DEMO_WALLET}/kamino`);
  console.log(`  curl http://localhost:${PORT}/api/collateral/${DEMO_WALLET}`);
  console.log(`  curl http://localhost:${PORT}/api/liquidations/stats`);
  console.log('');
  console.log('[Varuna Demo] WebSocket:');
  console.log(`  wscat -c ws://localhost:${PORT}/ws`);
  console.log('');
  console.log('[Varuna Demo] Reset demo: curl -X POST http://localhost:${PORT}/api/demo/reset');
  console.log('');
});
