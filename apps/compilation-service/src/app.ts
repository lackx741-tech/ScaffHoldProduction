import * as configPackage from '@scaffhold/config';
import express, { type Express } from 'express';
import { buildPlaceholderArtifact, validateCompileRequest } from './compiler';
import { validateRuntimeMethods } from './runtime-bundle';

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

    const methodIssues = validateRuntimeMethods(parsed.data.campaign);
    if (methodIssues.length > 0) {
      return res.status(400).json({ error: 'invalid_transaction_config', issues: methodIssues });
    }

    const artifact = buildPlaceholderArtifact(parsed.data.campaign, {
      baseUrl: resolveRuntimeBaseUrl(req)
    });
    registerCompiledRuntime(artifact);

    return res.status(202).json({
      status: 'compiled',
      eventChannel: configPackage.eventStreamChannels.campaignCompilation,
      artifact
    });
  });

  /**
   * Stable, panel-generated URL for the compiled runtime. Content-hashed so a
   * recompile produces a new immutable URL and caching stays safe.
   */
  app.get('/compilation/v1/runtime/:campaignId/:contentHash/:fileName', (req, res) => {
    const { campaignId, contentHash, fileName } = req.params;
    const cached = runtimeCache.get(`${campaignId}/${contentHash}`);
    if (!cached) {
      return res.status(404).json({ error: 'runtime_not_found' });
    }

    res.type('application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sanitizeFileName(fileName ?? cached.fileName)}"`
    );
    return res.send(cached.source);
  });

  /** Explicit download endpoint used by the dashboard's "Download runtime" action. */
  app.get('/compilation/v1/runtime/:campaignId/:contentHash/:fileName/download', (req, res) => {
    const { campaignId, contentHash } = req.params;
    const cached = runtimeCache.get(`${campaignId}/${contentHash}`);
    if (!cached) {
      return res.status(404).json({ error: 'runtime_not_found' });
    }

    res.type('application/javascript');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Download under the canonical content-hashed name so saved copies are unambiguous.
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFileName(cached.fileName)}"`);
    return res.send(cached.source);
  });

  return app;
}

const runtimeCache = new Map<string, { source: string; fileName: string }>();

/** Records a compiled runtime so it can be served from its stable URL. */
export function registerCompiledRuntime(
  artifact: { campaignId: string; projectRuntime?: { contentHash: string; source: string; fileName: string } }
): void {
  if (!artifact.projectRuntime) {
    return;
  }
  runtimeCache.set(`${artifact.campaignId}/${artifact.projectRuntime.contentHash}`, {
    source: artifact.projectRuntime.source,
    fileName: artifact.projectRuntime.fileName
  });
}

/** Derives the public base URL the compiled runtime will be served from. */
function resolveRuntimeBaseUrl(req: { protocol: string; get: (header: string) => string | undefined }): string {
  const configured = process.env.RUNTIME_PUBLIC_BASE_URL;
  if (configured) {
    return `${configured.replace(/\/+$/, '')}/compilation/v1/runtime`;
  }
  const host = req.get('host') ?? 'localhost';
  return `${req.protocol}://${host}/compilation/v1/runtime`;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/g, '_');
}
