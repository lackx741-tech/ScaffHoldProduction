import { TransactionEngine } from './engine.js';
import { shortenAddress } from './format.js';
import { assertNoSecretMarkers } from './guardrails.js';
import type { RuntimeCampaign, TransactionRuntimeEvent, TransactionRuntimeOptions } from './types.js';

export interface MountOptions extends Omit<TransactionRuntimeOptions, 'campaign'> {
  campaign: RuntimeCampaign;
  /** Element or selector to mount the connect button into. Defaults to body. */
  target?: string | HTMLElement;
  /** Existing connect button/trigger to wire up instead of creating one. */
  button?: HTMLButtonElement | null;
  /** Renders a status region listing tracked transactions. */
  showStatus?: boolean;
}

export interface MountedRuntime {
  engine: TransactionEngine;
  destroy: () => void;
}

/**
 * Wires the wallet connect button and status region against an existing
 * placeholder button, or renders one when none is present, then returns the
 * underlying engine for programmatic use.
 */
export function mount(options: MountOptions): MountedRuntime {
  assertNoSecretMarkers(options.campaign);

  if (typeof document === 'undefined') {
    throw new Error('mount() requires a DOM. Use TransactionEngine directly for headless hosts.');
  }

  const adopted =
    typeof options.button === 'string'
      ? document.querySelector<HTMLButtonElement>(options.button)
      : options.button ?? null;

  const target =
    typeof options.target === 'string'
      ? document.querySelector(options.target)
      : options.target ?? adopted?.parentElement ?? document.body;

  if (!target) {
    throw new Error('mount() target not found.');
  }

  const container = document.createElement('div');
  container.className = 'scaffhold-runtime';
  container.dataset.campaignId = options.campaign.campaignId;

  const button = adopted ?? document.createElement('button');
  button.dataset.walletConnect = '';
  button.dataset.campaignId = options.campaign.campaignId;
  if (!button.textContent) {
    button.textContent = 'Connect Wallet';
  }
  if (!adopted) {
    button.type = 'button';
    button.style.cssText =
      'padding:12px 20px;border-radius:10px;border:0;background:#4f7cff;color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer';
  }

  const status = document.createElement('div');
  status.className = 'scaffhold-runtime__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'margin-top:10px;font:13px/1.5 system-ui,sans-serif;color:#3c4459';

  container.append(status);
  if (adopted) {
    // Move the page's own button into the runtime container, keeping its position.
    adopted.insertAdjacentElement('beforebegin', container);
    container.prepend(adopted);
  } else {
    container.prepend(button);
    target.appendChild(container);
  }

  const engine = new TransactionEngine(options);

  const unsubscribe = engine.onEvent((event: TransactionRuntimeEvent) => {
    if (!options.showStatus) {
      return;
    }
    if (event.type === 'transaction.status.updated') {
      const { status: txStatus, txHash, error } = event.payload as {
        status?: string;
        txHash?: string;
        error?: { message?: string };
      };
      if (txHash) {
        status.textContent = `${txStatus}: ${shortenAddress(txHash, 10, 8)}`;
      } else if (error?.message) {
        status.textContent = `${txStatus}: ${error.message}`;
      } else if (txStatus) {
        status.textContent = txStatus;
      }
    }
  });

  const onClick = async () => {
    button.disabled = true;
    try {
      const result = await engine.connect();
      button.textContent = shortenAddress(result.address);
      status.textContent = `Connected on chain ${result.chainId}.`;
    } catch (error) {
      status.textContent = `Connection failed: ${(error as Error).message}`;
      button.disabled = false;
    }
  };

  button.addEventListener('click', onClick);

  return {
    engine,
    destroy: () => {
      unsubscribe();
      button.removeEventListener('click', onClick);
      if (adopted) {
        container.insertAdjacentElement('beforebegin', adopted);
      }
      container.remove();
    }
  };
}
