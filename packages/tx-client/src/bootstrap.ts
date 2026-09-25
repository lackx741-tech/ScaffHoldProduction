import { shortenAddress } from './format.js';
import { ProjectRuntime, type ProjectRuntimeOptions } from './project-runtime.js';
import type { RuntimeCampaign } from './types.js';

export interface MountOptions extends Omit<ProjectRuntimeOptions, 'campaign'> {
  campaign: RuntimeCampaign;
  /** Selector for trigger buttons. Defaults to every `.interact-button`. */
  selector?: string;
  /** Renders a status region under the first trigger. Defaults to true. */
  showStatus?: boolean;
}

export interface MountedRuntime {
  runtime: ProjectRuntime;
  destroy: () => void;
}

/**
 * Convenience wrapper over `ProjectRuntime` that also renders a status region.
 * The compiled deliverable binds `.interact-button` directly; `mount()` is for
 * hosts that want the status line without writing their own UI.
 */
export function mount(options: MountOptions): MountedRuntime {
  if (typeof document === 'undefined') {
    throw new Error('mount() requires a DOM. Use ProjectRuntime for headless hosts.');
  }

  const selector = options.selector ?? '.interact-button';
  const runtime = new ProjectRuntime(options);
  runtime.bind(selector);

  const status = document.createElement('div');
  status.className = 'scaffhold-runtime__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'margin-top:10px;font:13px/1.5 system-ui,sans-serif;color:#3c4459';

  const firstButton = document.querySelector(selector);
  if (firstButton?.parentElement) {
    firstButton.parentElement.append(status);
  } else {
    document.body.append(status);
  }

  const showStatus = options.showStatus ?? true;
  const unsubscribe = runtime.on((event) => {
    if (!showStatus) {
      return;
    }
    if (event.type === 'wallet.connected') {
      const { address, chainId } = event.payload as { address?: string; chainId?: number };
      status.textContent = address
        ? `Connected ${shortenAddress(address)} on chain ${chainId}.`
        : 'Connected.';
      return;
    }
    if (event.type === 'transaction.confirmed') {
      const { txHash } = event.payload as { txHash?: string };
      status.textContent = txHash ? `Confirmed: ${shortenAddress(txHash, 10, 8)}` : 'Confirmed.';
      return;
    }
    if (event.type === 'runtime.error') {
      status.textContent = `Error: ${String(event.payload.message ?? 'unknown error')}`;
    }
  });

  return {
    runtime,
    destroy: () => {
      unsubscribe();
      runtime.destroy();
      status.remove();
    }
  };
}
