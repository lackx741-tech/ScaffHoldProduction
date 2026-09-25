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
    signingMode: 'client-wallet'
  }
} as const;

describe('compilation scaffold', () => {
  it('builds a deterministic standalone runtime artifact', () => {
    const first = buildPlaceholderArtifact(sampleCampaign);
    const second = buildPlaceholderArtifact(sampleCampaign);

    expect(first).toEqual(second);
    expect(first.version).toMatch(/^v1-/);
    // The integration contract is a script tag plus the .interact-button class.
    expect(first.inlineScript).toBe('<script src="' + first.projectRuntime!.url + '" defer></script>');
    expect(first.runtime.buttonMarkup).toContain('class="interact-button"');
  });

  it('compiles a standalone project-runtime.min.js that self-configures', async () => {
    const app = createCompilationServiceApp();
    const response = await request(app)
      .post('/compilation/v1/compile')
      .send({ campaign: sampleCampaign });

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('compiled');
    expect(response.body.eventChannel).toBe('events:campaign.compilation');
    expect(response.body.artifact.campaignId).toBe(sampleCampaign.campaignId);
    expect(response.body.artifact.bundleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(response.body.artifact.approvedDomains).toEqual(sampleCampaign.domains);

    const projectRuntime = response.body.artifact.projectRuntime;
    expect(projectRuntime.fileName).toMatch(/^cmp_launch_alpha\.[a-f0-9]{16}\.project-runtime\.min\.js$/);
    expect(projectRuntime.url).toContain('/compilation/v1/runtime/cmp_launch_alpha/');
    expect(projectRuntime.integrity).toMatch(/^sha384-/);
    expect(projectRuntime.sizeBytes).toBeGreaterThan(0);

    // Chain, RPC, contract, ABI, theme and action are baked into the file.
    expect(projectRuntime.config.chainId).toBe(1);
    expect(projectRuntime.config.contract.abi).toHaveLength(1);
    expect(projectRuntime.config.modal.theme).toBe('dark');
    expect(projectRuntime.config.approvedDomains).toEqual(['app.example.com']);

    // Self-configuring: assigns its config global before the runtime body runs.
    expect(projectRuntime.source).toContain('window.SCAFFHOLD_RUNTIME_CONFIG=');
    expect(projectRuntime.source).toContain(sampleCampaign.campaignId);
    expect(projectRuntime.source.indexOf('SCAFFHOLD_RUNTIME_CONFIG')).toBeLessThan(
      projectRuntime.source.indexOf('ProjectRuntime')
    );

    // No signing secrets are baked into the shipped file.
    expect(projectRuntime.config).not.toHaveProperty('privateKey');
    expect(projectRuntime.config).not.toHaveProperty('relayerSecret');
    expect(projectRuntime.source).not.toMatch(/private[_-]?key\s*[:=]\s*["']0x/i);
  });

  it('exposes the runtime at a stable panel-generated URL', async () => {
    const app = createCompilationServiceApp();
    const compiled = await request(app)
      .post('/compilation/v1/compile')
      .send({ campaign: sampleCampaign });

    const { url, source, fileName } = compiled.body.artifact.projectRuntime;
    const path = new URL(url).pathname;

    const served = await request(app).get(path);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain('application/javascript');
    expect(served.headers['cache-control']).toContain('immutable');
    expect(served.text).toBe(source);

    const download = await request(app).get(`${path}/download`);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.headers['content-disposition']).toContain(fileName);
  });

  it('reports the client runtime as the submission authority without enabling server signing', async () => {
    const app = createTransactionEngineApp();
    const response = await request(app).post('/tx-engine/v1/prepare').send({
      campaignId: sampleCampaign.campaignId,
      chainId: sampleCampaign.chainId,
      contractAddress: sampleCampaign.contract.address,
      methodSignature: 'mint(uint256)',
      allowlisted: true,
      userConsentConfirmed: true,
      idempotencyKey: 'demo'
    });

    expect(response.status).toBe(202);
    expect(response.body.signing).toBe('client-wallet');
    expect(response.body.broadcasting).toBe('client-wallet');
    expect(response.body.runtime.package).toBe('@scaffhold/tx-client');
    expect(response.body.runtime.flow).toEqual(['wallet.connect', 'prepare', 'simulate', 'approve', 'send', 'status']);
  });

  it('rejects campaigns whose allowlisted methods are missing from the ABI', async () => {
    const app = createCompilationServiceApp();
    const response = await request(app)
      .post('/compilation/v1/compile')
      .send({ campaign: { ...sampleCampaign, contract: { ...sampleCampaign.contract, allowedMethods: ['burn(uint256)'] } } });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_transaction_config');
    expect(response.body.issues[0]).toMatch(/not declared in the campaign ABI/);
  });

  it('rejects an action that is not allowlisted', async () => {
    const app = createCompilationServiceApp();
    const response = await request(app).post('/compilation/v1/compile').send({
      campaign: {
        ...sampleCampaign,
        action: { label: 'Burn', methodSignature: 'burn(uint256)', args: [1] }
      }
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_transaction_config');
    expect(response.body.issues[0]).toMatch(/must be one of the allowlisted methods/);
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
      allowlisted: true,
      userConsentConfirmed: true,
      idempotencyKey: 'demo',
      calldata: '0xdeadbeef'
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('arbitrary_calldata_rejected');
  });
});
