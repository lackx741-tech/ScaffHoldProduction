/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url":"https://app.example.com/"}
 */
import { describe, expect, it } from 'vitest';
import { buildPlaceholderArtifact } from '../apps/compilation-service/src/compiler';
import type { CampaignConfig } from '../packages/shared-types/src/index';

const campaign: CampaignConfig = {
  campaignId: 'cmp_launch_alpha',
  name: 'Launch Alpha',
  environment: 'development',
  chainId: 1,
  contract: {
    address: '0x1111111111111111111111111111111111111111',
    abi: [{ name: 'mint', type: 'function', inputs: [{ name: 'amount', type: 'uint256' }] }],
    allowedMethods: ['mint(uint256)']
  },
  domains: ['app.example.com'],
  walletProviders: ['injected'],
  modal: { title: 'Connect', theme: 'dark' },
  transactionPolicy: { userConsentRequired: true, relayerEnabled: false, signingMode: 'client-wallet' }
};

const FROM = '0x2222222222222222222222222222222222222222';

interface ScaffoldGlobal {
  autoMount: () => { engine: { connect: () => Promise<{ address: string }> }; destroy: () => void } | undefined;
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
        default:
          throw new Error(`Unhandled method ${method}`);
      }
    }
  };
}

/** Runs the inline script bodies from the compiled artifact in document order. */
function executeInlineScripts(html: string): void {
  const bodies = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? '');
  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) {
    new Function('window', 'document', 'location', body)(window, document, window.location);
  }
}

describe('compiled inline runtime output', () => {
  it('inlines the runtime and wires the campaign connect button with no external script host', async () => {
    const artifact = buildPlaceholderArtifact(campaign);
    expect(artifact.runtime).toBeDefined();
    const runtime = artifact.runtime!;
    const bootstrapScript = runtime.bootstrapScript;

    expect(runtime.strategy).toBe('inline');
    expect(bootstrapScript).not.toMatch(/<script[^>]*\ssrc=/);
    expect(bootstrapScript).toContain('data-wallet-connect');

    document.body.innerHTML = bootstrapScript.replace(/<script>[\s\S]*?<\/script>/g, '');
    (window as unknown as { ethereum?: unknown }).ethereum = createProvider();

    executeInlineScripts(bootstrapScript);

    const api = (window as unknown as { ScaffHoldTx?: ScaffoldGlobal }).ScaffHoldTx;
    expect(api?.autoMount).toBeTypeOf('function');

    // The compiled output ships its own connect button; autoMount adopts it.
    const button = document.querySelector<HTMLButtonElement>('.scaffhold-runtime button[data-wallet-connect]');
    expect(button).not.toBeNull();
    expect(button!.dataset.campaignId).toBe(campaign.campaignId);

    button!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const status = document.querySelector('.scaffhold-runtime__status');
    expect(status?.textContent).toContain('Connected on chain 1');
  });

  it('mounts without a provider warning when no EIP-1193 wallet is present', () => {
    const artifact = buildPlaceholderArtifact(campaign);
    document.body.innerHTML = artifact.runtime.bootstrapScript.replace(/<script>[\s\S]*?<\/script>/g, '');
    delete (window as unknown as { ethereum?: unknown }).ethereum;

    executeInlineScripts(artifact.runtime.bootstrapScript);
    expect((window as unknown as { ScaffHoldTx: ScaffoldGlobal }).ScaffHoldTx.autoMount()).toBeUndefined();
  });
});
