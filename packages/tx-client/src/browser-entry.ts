import { ProjectRuntime, type ProjectRuntimeOptions } from './project-runtime.js';
import { TransactionEngine } from './engine.js';
import { mount, type MountOptions, type MountedRuntime } from './bootstrap.js';
import type { Eip1193Provider, RuntimeCampaign } from './types.js';

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    /** Baked into the compiled `project-runtime.min.js` by the compiler. */
    SCAFFHOLD_RUNTIME_CONFIG?: string | RuntimeCampaign;
    /** Public API exposed by the compiled script. */
    ProjectRuntime?: ProjectRuntime;
  }
}

/**
 * Reads the campaign config baked into the compiled file. Falls back to a
 * `data-campaign-config` attribute so the same runtime also works when it is
 * loaded from an external script tag instead of a per-campaign build.
 */
function readEmbeddedCampaign(): RuntimeCampaign | undefined {
  const injected = typeof window !== 'undefined' ? window.SCAFFHOLD_RUNTIME_CONFIG : undefined;
  if (injected) {
    return typeof injected === 'string' ? decodeCampaignConfig(injected) : injected;
  }

  const script = document.currentScript as HTMLScriptElement | null;
  const encoded = script?.dataset?.['campaignConfig'];
  return encoded ? decodeCampaignConfig(encoded) : undefined;
}

function decodeCampaignConfig(encoded: string): RuntimeCampaign | undefined {
  try {
    return JSON.parse(atob(encoded)) as RuntimeCampaign;
  } catch (error) {
    console.error('[project-runtime] Failed to parse embedded campaign config.', error);
    return undefined;
  }
}

/**
 * Boots the compiled runtime: binds every `.interact-button` to the wallet
 * connect flow and publishes `window.ProjectRuntime`.
 */
function boot(options: Partial<ProjectRuntimeOptions> = {}): ProjectRuntime | undefined {
  const campaign = options.campaign ?? readEmbeddedCampaign();
  if (!campaign) {
    console.error('[project-runtime] No campaign config found; runtime not started.');
    return undefined;
  }

  const runtime = new ProjectRuntime({ ...options, campaign });
  runtime.bind();
  window.ProjectRuntime = runtime;

  // Bind again on DOMContentLoaded and after the window load so buttons that
  // appear later in the document are still wired.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => runtime.bind(), { once: true });
  }
  window.addEventListener('load', () => runtime.bind(), { once: true });

  return runtime;
}

boot();

export { ProjectRuntime, boot, mount, TransactionEngine };
export type { MountOptions, MountedRuntime, ProjectRuntimeOptions };
