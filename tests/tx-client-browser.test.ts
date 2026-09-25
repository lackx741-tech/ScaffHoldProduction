// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://app.example.com/" }
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildProjectRuntime } from '../apps/compilation-service/src/runtime-bundle.js';
import type { CampaignConfig } from '@scaffhold/shared-types';

const campaign: CampaignConfig = {
  campaignId: 'cmp_launch_alpha',
  name: 'Launch Alpha',
  environment: 'development',
  chainId: 137,
  rpcUrl: 'https://polygon-rpc.com',
  walletConnectProjectId: 'wc_project_123',
  contract: {
    address: '0x1111111111111111111111111111111111111111',
    abi: [
      { name: 'mint', type: 'function', inputs: [{ name: 'amount', type: 'uint256' }] },
      { name: 'totalSupply', type: 'function', inputs: [], outputs: [{ name: '', type: 'uint256' }] }
    ],
    allowedMethods: ['mint(uint256)', 'totalSupply()']
  },
  domains: ['app.example.com'],
  walletProviders: ['walletconnect-v2'],
  modal: { title: 'Mint', theme: 'dark' },
  action: { label: 'Mint 1', methodSignature: 'mint(uint256)', args: [1] },
  transactionPolicy: { userConsentRequired: true, relayerEnabled: false, signingMode: 'client-wallet' }
};

interface FakeProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function installProvider(provider: FakeProvider): void {
  (globalThis as unknown as { ethereum: unknown }).ethereum = provider;
}

function loadRuntime(source: string): void {
  // Execute the compiled standalone file exactly as a browser script tag would.
  const run = new Function('window', 'document', 'MutationObserver', source);
  run(globalThis, document, MutationObserver);
}

describe('compiled project-runtime.min.js deliverable', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (globalThis as unknown as { ProjectRuntime?: unknown }).ProjectRuntime;
  });

  it('is a single standalone file that bakes in chain, RPC, contract, ABI, theme and action', () => {
    const bundle = buildProjectRuntime(campaign, { baseUrl: 'https://panel.example.com/compilation/v1/runtime' });

    expect(bundle.fileName).toBe(`cmp_launch_alpha.${bundle.contentHash}.project-runtime.min.js`);
    expect(bundle.url).toBe(
      `https://panel.example.com/compilation/v1/runtime/cmp_launch_alpha/${bundle.contentHash}/project-runtime.min.js`
    );
    expect(bundle.config.chainId).toBe(137);
    expect(bundle.config.rpcUrl).toBe('https://polygon-rpc.com');
    expect(bundle.config.contract.address).toBe('0x1111111111111111111111111111111111111111');
    expect(bundle.config.contract.abi).toHaveLength(2);
    expect(bundle.config.modal.theme).toBe('dark');
    expect(bundle.config.action?.methodSignature).toBe('mint(uint256)');
    expect(bundle.integrity.startsWith('sha384-')).toBe(true);
    expect(bundle.sizeBytes).toBeGreaterThan(0);
  });

  it('binds every .interact-button automatically and exposes window.ProjectRuntime', () => {
    const bundle = buildProjectRuntime(campaign);
    document.body.innerHTML = `
      <button class="interact-button">Connect Wallet</button>
      <div><button class="interact-button">Mint</button></div>
      <button class="other">Untouched</button>`;

    loadRuntime(bundle.source);

    const api = (globalThis as unknown as { ProjectRuntime: { campaign: { campaignId: string } } }).ProjectRuntime;
    expect(api).toBeDefined();
    expect(api.campaign.campaignId).toBe('cmp_launch_alpha');

    const bound = document.querySelectorAll<HTMLButtonElement>('.interact-button');
    expect(bound).toHaveLength(2);
    bound.forEach((button) => expect(button.dataset.campaignId).toBe('cmp_launch_alpha'));
  });

  it('does not require dashboard code and carries no signing secrets', () => {
    const bundle = buildProjectRuntime(campaign);
    // The file must be self-configuring.
    expect(bundle.source).toContain('window.SCAFFHOLD_RUNTIME_CONFIG=');
    expect(bundle.source).toContain('cmp_launch_alpha');
    // No private key / mnemonic / relayer secret is baked in.
    expect(bundle.source).not.toMatch(/private[_-]?key\s*[:=]\s*["']0x/i);
    expect(bundle.source).not.toMatch(/mnemonic\s*[:=]/i);
    expect(bundle.config).not.toHaveProperty('privateKey');
  });

  it('emits wallet and chain events and connects through the injected provider', async () => {
    const calls: string[] = [];
    installProvider({
      request: async ({ method }) => {
        calls.push(method);
        if (method === 'eth_requestAccounts') return ['0xAbC0000000000000000000000000000000000001'];
        if (method === 'eth_chainId') return '0x89';
        if (method === 'eth_accounts') return ['0xAbC0000000000000000000000000000000000001'];
        return '0x0';
      }
    });

    const injectedCampaign: CampaignConfig = { ...campaign, walletProviders: ['injected'] };
    const bundle = buildProjectRuntime(injectedCampaign);
    document.body.innerHTML = '<button class="interact-button">Connect Wallet</button>';
    loadRuntime(bundle.source);

    const api = (globalThis as unknown as {
      ProjectRuntime: { on: (l: (e: { type: string }) => void) => () => void; connect: () => Promise<unknown> };
    }).ProjectRuntime;

    const seen: string[] = [];
    api.on((event) => seen.push(event.type));

    await api.connect();
    expect(calls).toContain('eth_requestAccounts');
    expect(seen).toContain('wallet.connected');
  });

  it('performs read calls against the baked-in contract and decodes outputs', async () => {
    installProvider({
      request: async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0xAbC0000000000000000000000000000000000001'];
        if (method === 'eth_chainId') return '0x89';
        // totalSupply() -> 42 (one 32-byte word, even hex length)
        if (method === 'eth_call') return `0x${'0'.repeat(62)}2a`;
        return '0x0';
      }
    });

    const injectedCampaign: CampaignConfig = { ...campaign, walletProviders: ['injected'] };
    const bundle = buildProjectRuntime(injectedCampaign);
    loadRuntime(bundle.source);

    const api = (globalThis as unknown as {
      ProjectRuntime: { connect: () => Promise<unknown>; read: (c: { methodSignature: string }) => Promise<unknown[]> };
    }).ProjectRuntime;

    await api.connect();
    const [supply] = await api.read({ methodSignature: 'totalSupply()' });
    expect(supply).toBe(42n);
  });

  it('refuses write calls to non-allowlisted methods', async () => {
    installProvider({
      request: async ({ method }) => {
        if (method === 'eth_requestAccounts') return ['0xAbC0000000000000000000000000000000000001'];
        if (method === 'eth_chainId') return '0x89';
        return '0x0';
      }
    });

    const injectedCampaign: CampaignConfig = { ...campaign, walletProviders: ['injected'] };
    const bundle = buildProjectRuntime(injectedCampaign);
    loadRuntime(bundle.source);

    const api = (globalThis as unknown as {
      ProjectRuntime: { connect: () => Promise<unknown>; write: (c: { methodSignature: string }) => Promise<unknown> };
    }).ProjectRuntime;

    await api.connect();
    await expect(api.write({ methodSignature: 'transfer(address,uint256)' })).rejects.toThrow(/allowlist/i);
  });

  it('ships the real built runtime file, not a stub', () => {
    const built = readFileSync(resolve('packages/tx-client/dist/scaffhold-tx.min.js'), 'utf8');
    const bundle = buildProjectRuntime(campaign);
    expect(bundle.source.endsWith(built)).toBe(true);
  });
});
