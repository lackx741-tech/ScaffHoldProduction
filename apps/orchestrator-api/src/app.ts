import * as configPackage from '@scaffhold/config';
import express, { type Express } from 'express';

const sampleCampaigns = [
  {
    id: 'cmp_launch_alpha',
    name: 'Launch Alpha',
    status: 'draft',
    environment: 'development'
  }
];

const sampleContracts = [
  {
    id: 'contract_alpha',
    campaignId: 'cmp_launch_alpha',
    chainId: 1,
    address: '0x1111111111111111111111111111111111111111',
    verified: false,
    allowedMethods: ['mint(uint256)']
  }
];

const sampleDomains = [
  {
    id: 'domain_alpha',
    campaignId: 'cmp_launch_alpha',
    domain: 'app.example.com',
    verificationStatus: 'pending'
  }
];

const sampleIntegrations = [
  {
    id: 'int_launch_alpha_v1',
    campaignId: 'cmp_launch_alpha',
    version: 'v1-placeholder',
    status: 'compiled'
  }
];

export function createOrchestratorApp(): Express {
  const config = configPackage.loadServiceConfig(
    'orchestrator-api',
    Number(process.env.ORCHESTRATOR_PORT ?? 4000)
  );
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: config.serviceName,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/ready', (_req, res) => {
    res.json({
      status: 'ready',
      service: config.serviceName,
      timestamp: new Date().toISOString(),
      dependencies: configPackage.dependencySummary(config)
    });
  });

  app.get('/metrics', (_req, res) => {
    res.type('text/plain').send('scaffold_requests_total 1\nscaffold_compilation_requests_total 0\n');
  });

  app.get('/api/v1/campaigns', (_req, res) => res.json({ items: sampleCampaigns }));
  app.post('/api/v1/campaigns', (req, res) => {
    res.status(201).json({
      status: 'placeholder',
      campaign: {
        id: `cmp_${Date.now()}`,
        ...req.body,
        status: 'draft'
      }
    });
  });
  app.get('/api/v1/campaigns/:campaignId', (req, res) => {
    res.json({
      campaign:
        sampleCampaigns.find((campaign) => campaign.id === req.params.campaignId) ?? {
          id: req.params.campaignId,
          status: 'missing',
          message: 'Placeholder lookup only.'
        }
    });
  });
  app.patch('/api/v1/campaigns/:campaignId', (req, res) => {
    res.json({ status: 'placeholder', campaignId: req.params.campaignId, patch: req.body });
  });
  app.delete('/api/v1/campaigns/:campaignId', (req, res) => {
    res.status(202).json({ status: 'placeholder', campaignId: req.params.campaignId, action: 'archive' });
  });
  app.post('/api/v1/campaigns/:campaignId/compile', (req, res) => {
    res.status(202).json({
      status: 'queued',
      campaignId: req.params.campaignId,
      eventChannel: configPackage.eventStreamChannels.campaignCompilation,
      payload: req.body
    });
  });
  app.post('/api/v1/campaigns/:campaignId/publish', (req, res) => {
    res.status(202).json({ status: 'placeholder', campaignId: req.params.campaignId, action: 'publish' });
  });
  app.post('/api/v1/campaigns/:campaignId/pause', (req, res) => {
    res.status(202).json({ status: 'placeholder', campaignId: req.params.campaignId, action: 'pause' });
  });

  app.get('/api/v1/contracts', (_req, res) => res.json({ items: sampleContracts }));
  app.post('/api/v1/contracts', (req, res) => {
    res.status(201).json({ status: 'placeholder', contract: req.body });
  });
  app.get('/api/v1/contracts/:contractId', (req, res) => {
    res.json({
      contract:
        sampleContracts.find((contract) => contract.id === req.params.contractId) ?? {
          id: req.params.contractId,
          status: 'missing',
          message: 'Placeholder lookup only.'
        }
    });
  });
  app.post('/api/v1/contracts/validate', (req, res) => {
    res.json({
      status: 'placeholder',
      valid: true,
      notes: ['ABI and on-chain verification must be implemented with scanner-service before production.'],
      input: req.body
    });
  });
  app.post('/api/v1/contracts/:contractId/simulate', (req, res) => {
    res.status(202).json({ status: 'placeholder', contractId: req.params.contractId, simulationRequest: req.body });
  });

  app.get('/api/v1/campaigns/:campaignId/domains', (req, res) => {
    res.json({ items: sampleDomains.filter((domain) => domain.campaignId === req.params.campaignId) });
  });
  app.post('/api/v1/campaigns/:campaignId/domains', (req, res) => {
    res.status(201).json({ status: 'placeholder', campaignId: req.params.campaignId, domain: req.body });
  });
  app.delete('/api/v1/campaigns/:campaignId/domains/:domainId', (req, res) => {
    res.status(202).json({ status: 'placeholder', campaignId: req.params.campaignId, domainId: req.params.domainId });
  });
  app.post('/api/v1/domains/:domainId/verify', (req, res) => {
    res.status(202).json({
      status: 'queued',
      domainId: req.params.domainId,
      eventChannel: configPackage.eventStreamChannels.domainVerification,
      request: req.body
    });
  });

  app.get('/api/v1/campaigns/:campaignId/integrations', (req, res) => {
    res.json({ items: sampleIntegrations.filter((integration) => integration.campaignId === req.params.campaignId) });
  });
  app.get('/api/v1/integrations/:integrationId', (req, res) => {
    res.json({
      integration:
        sampleIntegrations.find((integration) => integration.id === req.params.integrationId) ?? {
          id: req.params.integrationId,
          status: 'missing',
          message: 'Placeholder lookup only.'
        }
    });
  });
  app.post('/api/v1/integrations/:integrationId/revoke', (req, res) => {
    res.status(202).json({ status: 'placeholder', integrationId: req.params.integrationId, action: 'revoke' });
  });
  app.get('/api/v1/integrations/:integrationId/download', (req, res) => {
    res.json({
      integrationId: req.params.integrationId,
      downloadUrl: `/artifacts/${req.params.integrationId}/manifest.json`,
      notes: ['Compilation service must back this route with immutable artifact storage before production.']
    });
  });

  return app;
}
