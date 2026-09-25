import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createCompilationServiceApp } from '../apps/compilation-service/src/app';
import { buildPlaceholderArtifact } from '../apps/compilation-service/src/compiler';
import { createTransactionEngineApp } from '../apps/transaction-engine/src/app';

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
    expect(first.inlineScript).toContain(`data-version="${first.version}"`);
  });

  it('validates and returns a placeholder compilation response', async () => {
    const app = createCompilationServiceApp();
    const response = await request(app)
      .post('/compilation/v1/compile')
      .send({ campaign: sampleCampaign });

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('compiled-placeholder');
    expect(response.body.eventChannel).toBe('events:campaign.compilation');
    expect(response.body.artifact.campaignId).toBe(sampleCampaign.campaignId);
    expect(response.body.artifact.bundleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(response.body.artifact.approvedDomains).toEqual(sampleCampaign.domains);
  });

  it('rejects invalid campaign payloads', async () => {
    const app = createCompilationServiceApp();
    const response = await request(app).post('/compilation/v1/compile').send({
      campaign: { ...sampleCampaign, domains: [] }
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_campaign_config');
  });

  it('applies the same transaction safety checks to simulate requests', async () => {
    const app = createTransactionEngineApp();
    const response = await request(app).post('/tx-engine/v1/simulate').send({
      campaignId: sampleCampaign.campaignId,
      chainId: sampleCampaign.chainId,
      contractAddress: sampleCampaign.contract.address,
      methodSignature: 'mint(uint256)',
      allowlisted: false,
      userConsentConfirmed: true,
      idempotencyKey: 'demo',
      calldata: '0xdeadbeef'
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('arbitrary_calldata_rejected');
  });
});
