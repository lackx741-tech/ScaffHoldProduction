import * as configPackage from '@scaffhold/config';
import express, { type Express } from 'express';

export function createScannerApp(): Express {
  const config = configPackage.loadServiceConfig('scanner-service', Number(process.env.SCANNER_PORT ?? 4001));
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: config.serviceName, timestamp: new Date().toISOString() });
  });

  app.get('/ready', (_req, res) => {
    res.json({
      status: 'ready',
      service: config.serviceName,
      timestamp: new Date().toISOString(),
      dependencies: configPackage.dependencySummary(config)
    });
  });

  app.get('/scanner/v1/chains/:chainId/status', (req, res) => {
    res.json({
      chainId: Number(req.params.chainId),
      status: 'healthy',
      source: 'placeholder-rpc',
      cachedBy: configPackage.redisKeys.cache('chain-status', req.params.chainId),
      readOnly: true
    });
  });

  app.get('/scanner/v1/address/:address/balances', (req, res) => {
    res.json({
      address: req.params.address,
      chainId: Number(req.query.chainId ?? 1),
      items: [
        {
          symbol: 'ETH',
          balance: '0.0000',
          source: 'placeholder',
          asOf: new Date().toISOString()
        }
      ]
    });
  });

  app.get('/scanner/v1/address/:address/allowances', (req, res) => {
    res.json({
      address: req.params.address,
      chainId: Number(req.query.chainId ?? 1),
      items: [],
      notes: ['Allowance scanning is scaffolded only and must remain read-only.']
    });
  });

  app.get('/scanner/v1/address/:address/nfts', (req, res) => {
    res.json({
      address: req.params.address,
      chainId: Number(req.query.chainId ?? 1),
      items: [],
      floorPriceSource: 'placeholder'
    });
  });

  app.get('/scanner/v1/contracts/:address', (req, res) => {
    res.json({
      address: req.params.address,
      chainId: Number(req.query.chainId ?? 1),
      exists: true,
      verified: false,
      methods: ['mint(uint256)']
    });
  });

  app.get('/scanner/v1/transactions/:hash', (req, res) => {
    res.json({
      hash: req.params.hash,
      status: 'placeholder',
      confirmations: 0,
      source: 'read-only scanner scaffold'
    });
  });

  return app;
}
