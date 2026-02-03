import dotenv from 'dotenv';
import { PositionMonitor } from './services/monitor';
import { createServer } from './api/server';

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

  app.listen(PORT, () => {
    console.log(`[Varuna] API server running on http://localhost:${PORT}`);
    console.log(`[Varuna] Connected to Solana RPC: ${RPC_URL}`);
    console.log('');
    console.log('[Varuna] Available endpoints:');
    console.log('  GET  /health              - Health check');
    console.log('  GET  /api/status          - Monitor status');
    console.log('  GET  /api/health/:wallet  - Check wallet health');
    console.log('  GET  /api/positions/:wallet - Get all positions');
    console.log('  POST /api/watch           - Add wallet to watchlist');
    console.log('  DELETE /api/watch/:wallet - Remove from watchlist');
    console.log('  GET  /api/alerts          - Get alerts');
    console.log('  POST /api/monitor/start   - Start monitoring');
    console.log('  POST /api/monitor/stop    - Stop monitoring');
    console.log('');
  });
}

main().catch(console.error);
