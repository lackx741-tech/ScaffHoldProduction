import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createCompilationServiceApp } from '../apps/compilation-service/src/app';
import { buildPlaceholderArtifact } from '../apps/compilation-service/src/compiler';

const sampleCampaign = {
  campaignId: 'cmp_launch_alpha',
  name: 'Launch Alpha',
  environment: 'development',
  chainId: 1,
  contract: {
    address: '0x1111111111111111111111111111111111111111',
    abi: [
      {
        name: 'mint',
        type: 'function',
        inputs: [{ name: 'amount', type: 'uint256' }]
      }
    ],
    allowedMethods: ['mint(uint256)']
  },
  domains: ['app.example.com'],
  walletProviders: ['reown', 'rainbowkit'],
  modal: {
    title: 'Connect wallet to mint',
    theme: 'dark'
  },
  transactionPolicy: {
    userConsentRequired: true,
    relayerEnabled: false,
    signingMode: 'disabled'
  }
} as const;

describe('compilation scaffold', () => {
  it('builds a deterministic placeholder artifact', () => {
    const first = buildPlaceholderArtifact(sampleCampaign);
    const second = buildPlaceholderArtifact(sampleCampaign);

    expect(first).toEqual(second);
    expect(first.version).toMatch(/^v1-/);
    expect(first.inlineScript).toContain(sampleCampaign.campaignId);
  });

  it('validates and returns a placeholder compilation response', async () => {
    const app = createCompilationServiceApp();
    const response = await request(app)
      .post('/compilation/v1/compile')
      .send({ campaign: sampleCampaign });

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('compiled-placeholder');
    expect(response.body.artifact.campaignId).toBe(sampleCampaign.campaignId);
  });

  it('rejects invalid campaign payloads', async () => {
    const app = createCompilationServiceApp();
    const response = await request(app).post('/compilation/v1/compile').send({
      campaign: { ...sampleCampaign, domains: [] }
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_campaign_config');
  });
});
