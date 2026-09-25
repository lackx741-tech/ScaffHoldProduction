import * as configPackage from '@scaffhold/config';
import express, { type Express } from 'express';
import { buildPlaceholderArtifact, validateCompileRequest } from './compiler';

export function createCompilationServiceApp(): Express {
  const config = configPackage.loadServiceConfig(
    'compilation-service',
    Number(process.env.COMPILATION_SERVICE_PORT ?? 4003)
  );
  const app = express();
  app.use(express.json());

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

  app.post('/compilation/v1/compile', (req, res) => {
    const parsed = validateCompileRequest(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_campaign_config', details: parsed.error.flatten() });
    }

    const artifact = buildPlaceholderArtifact(parsed.data.campaign);

    return res.status(202).json({
      status: 'compiled-placeholder',
      eventChannel: configPackage.eventStreamChannels.campaignCompilation,
      artifact
    });
  });

  return app;
}
