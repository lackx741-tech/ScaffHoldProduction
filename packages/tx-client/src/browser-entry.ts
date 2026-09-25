import { mount, type MountOptions, type MountedRuntime } from './bootstrap.js';
import { TransactionEngine } from './engine.js';
import type { Eip1193Provider, RuntimeCampaign } from './types.js';

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    ScaffHoldTx?: {
      mount: (options: MountOptions) => MountedRuntime;
      TransactionEngine: typeof TransactionEngine;
      autoMount: () => MountedRuntime | undefined;
    };
  }
}

/**
 * Reads the campaign config embedded by the compilation service and mounts the
 * runtime against the injected wallet provider. Public config only: no secrets.
 */
function readEmbeddedCampaign(): RuntimeCampaign | undefined {
  const script = document.currentScript as HTMLScriptElement | null;
  const encoded = script?.dataset?.['campaignConfig'];
  if (!encoded) {
    return undefined;
  }
  try {
    const json = atob(encoded);
    return JSON.parse(json) as RuntimeCampaign;
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

  const buttons = document.querySelectorAll<HTMLElement>('[data-wallet-connect]');
  const target = buttons[0]?.parentElement ?? document.body;
  return mount({ campaign, provider, target });
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
