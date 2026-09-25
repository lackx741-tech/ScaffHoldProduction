import { mount, type MountOptions, type MountedRuntime } from './bootstrap.js';
import { TransactionEngine } from './engine.js';
import type { Eip1193Provider, RuntimeCampaign } from './types.js';

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    /** Injected by the compilation service when the runtime is inlined. */
    SCAFFHOLD_RUNTIME_CONFIG?: string | RuntimeCampaign;
    ScaffHoldTx?: {
      mount: (options: MountOptions) => MountedRuntime;
      TransactionEngine: typeof TransactionEngine;
      autoMount: () => MountedRuntime | undefined;
    };
  }
}

/**
 * Reads the campaign config that the compilation service inlined ahead of the
 * runtime. When the runtime is loaded from an external script tag instead, the
 * config is read from that tag's data-campaign-config attribute.
 */
function readEmbeddedCampaign(): RuntimeCampaign | undefined {
  const injected = typeof window !== 'undefined' ? window.SCAFFHOLD_RUNTIME_CONFIG : undefined;
  if (injected) {
    if (typeof injected === 'object') {
      return injected;
    }
    const decoded = decodeCampaignConfig(injected);
    if (decoded) {
      return decoded;
    }
  }

  const script = document.currentScript as HTMLScriptElement | null;
  const encoded = script?.dataset?.['campaignConfig'];
  if (!encoded) {
    return undefined;
  }
  return decodeCampaignConfig(encoded);
}

function decodeCampaignConfig(encoded: string): RuntimeCampaign | undefined {
  try {
    return JSON.parse(atob(encoded)) as RuntimeCampaign;
  } catch (error) {
    console.error('[scaffhold-tx] Failed to parse embedded campaign config.', error);
    return undefined;
  }
}

function autoMount(): MountedRuntime | undefined {
  const campaign = readEmbeddedCampaign();
  if (!campaign) {
    return undefined;
  }
  const provider = window.ethereum;
  if (!provider) {
    console.warn('[scaffhold-tx] No EIP-1193 provider (window.ethereum) detected.');
    return undefined;
  }

  const button = document.querySelector<HTMLButtonElement>('[data-wallet-connect]');
  return mount({ campaign, provider, button, target: button?.parentElement ?? document.body });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void autoMount(), { once: true });
  } else {
    void autoMount();
  }
}

window.ScaffHoldTx = { mount, TransactionEngine, autoMount };

export { TransactionEngine, mount, autoMount };
export type { MountOptions, MountedRuntime };
