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

  // Risk assessment for a wallet (NEW — Risk Engine)
  app.get('/api/risk/:wallet', async (req: Request, res: Response) => {
    try {
      const { wallet } = req.params;
      const assessment = await monitor.assessRisk(wallet);

      res.json(assessment);
    } catch (error) {
      res.status(500).json({ error: 'Failed to assess risk' });
    }
  });

  // Risk assessment for specific protocol position
  app.get('/api/risk/:wallet/:protocol', async (req: Request, res: Response) => {
    try {
      const { wallet, protocol } = req.params;

      if (!['kamino', 'marginfi', 'solend'].includes(protocol)) {
        return res.status(400).json({ error: 'Invalid protocol. Use: kamino, marginfi, or solend' });
      }

      const position = await monitor.getPosition(wallet, protocol as 'kamino' | 'marginfi' | 'solend');

      if (!position) {
        return res.status(404).json({ error: 'No position found' });
      }

      const assessment = monitor.riskEngine.assessPosition(position);
      res.json(assessment);
    } catch (error) {
      res.status(500).json({ error: 'Failed to assess risk' });
    }
  });

  // Health factor trend history
  app.get('/api/risk/:wallet/:protocol/trend', (req: Request, res: Response) => {
    const { wallet, protocol } = req.params;
    const history = monitor.riskEngine.getHealthHistory(wallet, protocol);
    res.json({ wallet, protocol, history, count: history.length });
  });

  // ─── Protection Engine Endpoints ─────────────────────────────────

  // Evaluate protection options (dry analysis, no execution)
  app.get('/api/protect/:wallet/:protocol', async (req: Request, res: Response) => {
    try {
      const { wallet, protocol } = req.params;

      if (!['kamino', 'marginfi', 'solend'].includes(protocol)) {
        return res.status(400).json({ error: 'Invalid protocol. Use: kamino, marginfi, or solend' });
      }

      const result = await monitor.evaluateProtection(wallet, protocol as 'kamino' | 'marginfi' | 'solend');

      if (!result) {
        return res.status(404).json({ error: 'No position found' });
      }

      res.json({
        wallet,
        protocol,
        riskLevel: result.assessment.riskLevel,
        riskScore: result.assessment.riskScore,
        healthFactor: result.assessment.healthFactor,
        optionCount: result.options.length,
        options: result.options,
        bestOption: result.options[0] || null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to evaluate protection' });
    }
  });

  // Execute protection (dry run by default)
  app.post('/api/protect/:wallet/:protocol', async (req: Request, res: Response) => {
    try {
      const { wallet, protocol } = req.params;

      if (!['kamino', 'marginfi', 'solend'].includes(protocol)) {
        return res.status(400).json({ error: 'Invalid protocol. Use: kamino, marginfi, or solend' });
      }

      const result = await monitor.executeProtection(wallet, protocol as 'kamino' | 'marginfi' | 'solend');

      if (!result) {
        return res.status(404).json({ error: 'No position found' });
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to execute protection' });
    }
  });

  // Protection execution log
  app.get('/api/protect/log', (_req: Request, res: Response) => {
    const log = monitor.getProtectionLog();
    res.json({
      executions: log.length,
      successful: log.filter(r => r.success).length,
      log,
    });
  });

  // Get/update protection engine config
  app.get('/api/protect/config', (_req: Request, res: Response) => {
    res.json(monitor.protectionEngine.getConfig());
  });

  app.put('/api/protect/config', (req: Request, res: Response) => {
    const updates = req.body;
    monitor.protectionEngine.updateConfig(updates);
    res.json({
      message: 'Protection config updated',
      config: monitor.protectionEngine.getConfig(),
    });
  });

  // ─── Collateral Analyzer Endpoints ──────────────────────────────

  // Analyze collateral yield for all protocols
  app.get('/api/collateral/:wallet', async (req: Request, res: Response) => {
    try {
      const { wallet } = req.params;
      const analyses = await monitor.analyzeCollateral(wallet);
      res.json({ wallet, analyses, count: analyses.length });
    } catch (error) {
      res.status(500).json({ error: 'Failed to analyze collateral' });
    }
  });

  // Analyze collateral yield for specific protocol
  app.get('/api/collateral/:wallet/:protocol', async (req: Request, res: Response) => {
    try {
      const { wallet, protocol } = req.params;

      if (!['kamino', 'marginfi', 'solend'].includes(protocol)) {
        return res.status(400).json({ error: 'Invalid protocol. Use: kamino, marginfi, or solend' });
      }

      const analyses = await monitor.analyzeCollateral(wallet, protocol as 'kamino' | 'marginfi' | 'solend');
      if (analyses.length === 0) {
        return res.status(404).json({ error: 'No position found' });
      }

      res.json(analyses[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to analyze collateral' });
    }
  });

  // Yield leaderboard for a protocol
  app.get('/api/yields/:protocol', (req: Request, res: Response) => {
    const { protocol } = req.params;

    if (!['kamino', 'marginfi', 'solend'].includes(protocol)) {
      return res.status(400).json({ error: 'Invalid protocol. Use: kamino, marginfi, or solend' });
    }

    const leaderboard = monitor.collateralAnalyzer.getYieldLeaderboard(protocol as 'kamino' | 'marginfi' | 'solend');
    res.json({ protocol, assets: leaderboard });
  });

  // ─── Liquidation Feed Endpoints ─────────────────────────────────

  // Get recent liquidation events
  app.get('/api/liquidations', (req: Request, res: Response) => {
    const { protocol, wallet, limit, since } = req.query;
    const events = monitor.liquidationFeed.getEvents({
      protocol: protocol as string | undefined,
      wallet: wallet as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      since: since ? new Date(since as string) : undefined,
    });
    res.json({ events, count: events.length });
  });

  // Get liquidation stats
  app.get('/api/liquidations/stats', (_req: Request, res: Response) => {
    res.json(monitor.liquidationFeed.getStats());
  });

  // Start/stop the liquidation feed scanner
  app.post('/api/liquidations/start', (_req: Request, res: Response) => {
    monitor.liquidationFeed.start();
    res.json({ message: 'Liquidation feed started' });
  });

  app.post('/api/liquidations/stop', (_req: Request, res: Response) => {
    monitor.liquidationFeed.stop();
    res.json({ message: 'Liquidation feed stopped' });
  });

  // ─── WebSocket Stats ──────────────────────────────────────────

  app.get('/api/ws/stats', (_req: Request, res: Response) => {
    res.json(monitor.wsAlerts.getStats());
  });

  // ─── Alerts & Monitoring ───────────────────────────────────────

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
  app.post('/api/monitor/stop', (_req: Request, res: Response) => {
    monitor.stop();
    res.json({ message: 'Monitor stopped' });
  });

  return app;
}
