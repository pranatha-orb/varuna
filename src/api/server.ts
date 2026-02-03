import express, { Request, Response } from 'express';
import { PositionMonitor } from '../services/monitor';
import { ProtectionConfig } from '../types';

export function createServer(monitor: PositionMonitor) {
  const app = express();
  app.use(express.json());

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'varuna' });
  });

  // Get monitor status
  app.get('/api/status', (req: Request, res: Response) => {
    const status = monitor.getStatus();
    res.json(status);
  });

  // Check health factor for a wallet
  app.get('/api/health/:wallet', async (req: Request, res: Response) => {
    try {
      const { wallet } = req.params;
      const { positions, alerts } = await monitor.checkHealth(wallet);

      res.json({
        wallet,
        positions,
        alerts,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check health' });
    }
  });

  // Get positions for a wallet
  app.get('/api/positions/:wallet', async (req: Request, res: Response) => {
    try {
      const { wallet } = req.params;
      const positions = await monitor.getAllPositions(wallet);

      res.json({
        wallet,
        positions,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch positions' });
    }
  });

  // Get position for specific protocol
  app.get('/api/positions/:wallet/:protocol', async (req: Request, res: Response) => {
    try {
      const { wallet, protocol } = req.params;

      if (!['kamino', 'marginfi', 'solend'].includes(protocol)) {
        return res.status(400).json({ error: 'Invalid protocol. Use: kamino, marginfi, or solend' });
      }

      const position = await monitor.getPosition(wallet, protocol as 'kamino' | 'marginfi' | 'solend');

      if (!position) {
        return res.status(404).json({ error: 'No position found' });
      }

      res.json({
        wallet,
        position,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch position' });
    }
  });

  // Add wallet to watchlist
  app.post('/api/watch', (req: Request, res: Response) => {
    try {
      const config: ProtectionConfig = req.body;

      if (!config.wallet) {
        return res.status(400).json({ error: 'wallet is required' });
      }

      // Set defaults
      config.protocols = config.protocols || ['kamino', 'marginfi', 'solend'];
      config.healthThreshold = config.healthThreshold || 1.2;
      config.autoProtect = config.autoProtect || false;
      config.protectionStrategy = config.protectionStrategy || 'repay';
      config.maxProtectionAmount = config.maxProtectionAmount || 100;

      monitor.addWallet(config);

      res.json({
        message: 'Wallet added to watchlist',
        config,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add wallet' });
    }
  });

  // Remove wallet from watchlist
  app.delete('/api/watch/:wallet', (req: Request, res: Response) => {
    const { wallet } = req.params;
    monitor.removeWallet(wallet);
    res.json({ message: 'Wallet removed from watchlist' });
  });

  // Get alerts
  app.get('/api/alerts', (req: Request, res: Response) => {
    const { wallet } = req.query;
    const alerts = monitor.getAlerts(wallet as string | undefined);
    res.json({ alerts });
  });

  // Start monitoring
  app.post('/api/monitor/start', (req: Request, res: Response) => {
    const { interval } = req.body;
    monitor.start(interval || 30000);
    res.json({ message: 'Monitor started', interval: interval || 30000 });
  });

  // Stop monitoring
  app.post('/api/monitor/stop', (req: Request, res: Response) => {
    monitor.stop();
    res.json({ message: 'Monitor stopped' });
  });

  return app;
}
