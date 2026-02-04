import dotenv from 'dotenv';
import { PositionMonitor } from './services/monitor';
import { createServer } from './api/server';

// ─── SDK Exports (for `import { Varuna } from 'varuna'`) ──────────
export { Varuna, VarunaGuardian } from './sdk';
export type {
  VarunaConfig,
  VarunaEvents,
  Protocol,
  Autonomy,
  Strategy,
  RiskLevel,
  RiskAssessment,
  WalletRiskAssessment,
  ProtectionOption,
  ProtectionResult,
  LendingPosition,
  AlertEvent,
  CollateralAnalysis,
  CollateralRecommendation,
  LiquidationEvent,
  LiquidationStats,
} from './sdk';

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PORT = process.env.PORT || 3000;

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║   ██╗   ██╗ █████╗ ██████╗ ██╗   ██╗███╗   ██╗ █████╗    ║');
  console.log('║   ██║   ██║██╔══██╗██╔══██╗██║   ██║████╗  ██║██╔══██╗   ║');
  console.log('║   ██║   ██║███████║██████╔╝██║   ██║██╔██╗ ██║███████║   ║');
  console.log('║   ╚██╗ ██╔╝██╔══██║██╔══██╗██║   ██║██║╚██╗██║██╔══██║   ║');
  console.log('║    ╚████╔╝ ██║  ██║██║  ██║╚██████╔╝██║ ╚████║██║  ██║   ║');
  console.log('║     ╚═══╝  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝   ║');
  console.log('║                                                           ║');
  console.log('║          DeFi Liquidation Protection for Solana           ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  // Initialize monitor
  const monitor = new PositionMonitor(RPC_URL);

  // Create and start API server
  const app = createServer(monitor);

  const server = app.listen(PORT, () => {
    console.log(`[Varuna] API server running on http://localhost:${PORT}`);
    console.log(`[Varuna] Connected to Solana RPC: ${RPC_URL}`);
    console.log('');
    console.log('[Varuna] Endpoints:');
    console.log('  Monitoring:');
    console.log('    GET  /api/status                     - Monitor status');
    console.log('    GET  /api/health/:wallet             - Wallet health check');
    console.log('    GET  /api/positions/:wallet           - All positions');
    console.log('    POST /api/watch                       - Add to watchlist');
    console.log('    POST /api/monitor/start               - Start auto-monitoring');
    console.log('  Risk Engine:');
    console.log('    GET  /api/risk/:wallet                - Risk assessment (all protocols)');
    console.log('    GET  /api/risk/:wallet/:protocol      - Risk assessment (single)');
    console.log('    GET  /api/risk/:wallet/:protocol/trend - Health factor trend');
    console.log('  Protection Engine:');
    console.log('    GET  /api/protect/:wallet/:protocol    - Evaluate options (dry)');
    console.log('    POST /api/protect/:wallet/:protocol    - Execute protection');
    console.log('    GET  /api/protect/log                  - Execution history');
    console.log('    GET  /api/protect/config               - Protection config');
    console.log('    PUT  /api/protect/config               - Update config');
    console.log('  Collateral Analyzer:');
    console.log('    GET  /api/collateral/:wallet           - Yield analysis (all protocols)');
    console.log('    GET  /api/collateral/:wallet/:protocol - Yield analysis (single)');
    console.log('    GET  /api/yields/:protocol             - Yield leaderboard');
    console.log('  Liquidation Feed:');
    console.log('    GET  /api/liquidations                 - Recent liquidation events');
    console.log('    GET  /api/liquidations/stats            - Liquidation statistics');
    console.log('    POST /api/liquidations/start            - Start liquidation scanner');
    console.log('    POST /api/liquidations/stop             - Stop liquidation scanner');
    console.log('  WebSocket:');
    console.log(`    ws://localhost:${PORT}/ws              - Real-time alerts + liquidation feed`);
    console.log('');
  });

  // Attach WebSocket server to HTTP server
  monitor.wsAlerts.attach(server);
}

main().catch(console.error);
