/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url":"https://app.example.com/"}
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RuntimeCampaign } from '../packages/tx-client/src/index';

const BUNDLE_PATH = resolve(process.cwd(), 'packages/tx-client/dist/scaffhold-tx.min.js');

const campaign: RuntimeCampaign = {
  campaignId: 'cmp_launch_alpha',
  name: 'Launch Alpha',
  environment: 'development',
  chainId: 1,
  contract: {
    address: '0x1111111111111111111111111111111111111111',
    abi: [{ name: 'mint', type: 'function', inputs: [{ name: 'amount', type: 'uint256' }] }],
    allowedMethods: ['mint(uint256)']
  },
  approvedDomains: ['app.example.com'],
  walletProviders: ['injected'],
  transactionPolicy: { userConsentRequired: true, relayerEnabled: false, signingMode: 'client-wallet' }
};

const FROM = '0x2222222222222222222222222222222222222222';
const TX_HASH = '0xfeed000000000000000000000000000000000000000000000000000000000001';

interface MountedRuntimeLike {
  engine: { connect: () => Promise<{ address: string }> };
  destroy: () => void;
}

interface ScaffoldGlobal {
  mount: (options: Record<string, unknown>) => MountedRuntimeLike;
  TransactionEngine: new (options: Record<string, unknown>) => unknown;
  autoMount: () => MountedRuntimeLike | undefined;
}

function api(): ScaffoldGlobal {
  return (window as unknown as { ScaffHoldTx: ScaffoldGlobal }).ScaffHoldTx;
}

function createProvider() {
  return {
    async request({ method }: { method: string }) {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [FROM];
        case 'eth_chainId':
          return '0x1';
        case 'eth_estimateGas':
          return '0x5208';
        case 'eth_call':
          return '0x';
        case 'eth_sendTransaction':
          return TX_HASH;
        default:
          throw new Error(`Unhandled method ${method}`);
      }
    }
  };
}

describe('built browser bundle', () => {
  beforeAll(() => {
    const source = readFileSync(BUNDLE_PATH, 'utf8');
    // Executes the real minified IIFE artifact against the jsdom global scope.
    new Function('window', 'document', 'location', source)(window, document, window.location);
  });

  it('registers the global namespace', () => {
    expect(typeof api().mount).toBe('function');
    expect(typeof api().TransactionEngine).toBe('function');
    expect(typeof api().autoMount).toBe('function');
  });

  it('autoMount reads the embedded base64 campaign config and renders a connect button', () => {
    const embedded = Buffer.from(JSON.stringify(campaign), 'utf8').toString('base64');
    const script = document.createElement('script');
    script.setAttribute('data-campaign-config', embedded);
    document.body.appendChild(script);
    Object.defineProperty(document, 'currentScript', { value: script, configurable: true });

    const host = document.createElement('div');
    host.innerHTML = '<button data-wallet-connect data-campaign-id="cmp_launch_alpha"></button>';
    document.body.appendChild(host);
    (window as unknown as { ethereum?: unknown }).ethereum = createProvider();

    const mounted = api().autoMount();
    expect(mounted).toBeDefined();

    const rendered = document.querySelector('.scaffhold-runtime button[data-wallet-connect]');
    expect(rendered?.textContent).toContain('Connect Wallet');
    expect(rendered?.getAttribute('data-campaign-id')).toBe('cmp_launch_alpha');

    mounted!.destroy();
    host.remove();
    delete (document as unknown as { currentScript?: unknown }).currentScript;
  });

  it('mount returns a live engine and enforces the domain allowlist', async () => {
    const mounted = api().mount({
      campaign,
      hostname: 'app.example.com',
      provider: createProvider(),
      requestApproval: async () => true,
      showStatus: true
    });

    const connected = await mounted.engine.connect();
    expect(connected.address).toBe(FROM);

    const Engine = api().TransactionEngine;
    expect(() =>
      new Engine({
        campaign,
        hostname: 'attacker.net',
        provider: createProvider(),
        requestApproval: async () => true
      })
    ).toThrow(/not in the campaign allowlist/);

    mounted.destroy();
    expect(mounted.engine).toBeDefined();
  });
});
