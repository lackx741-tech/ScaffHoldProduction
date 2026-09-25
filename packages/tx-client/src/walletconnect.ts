import type { Eip1193Provider } from './types.js';

export interface WalletConnectProviderOptions {
  projectId: string;
  chainId: number;
  rpcUrl?: string;
  dappName?: string;
  dappUrl?: string;
  dappIcons?: string[];
  theme?: 'light' | 'dark';
  /** Overrides the WalletConnect loader. Used by tests and custom hosts. */
  loadProvider?: () => Promise<WalletConnectLoader>;
}

export type ProviderKind = 'walletconnect' | 'injected';

export interface WalletConnectLoader {
  init: (options: Record<string, unknown>) => Promise<Eip1193Provider>;
}

/**
 * Loads the official WalletConnect v2 EthereumProvider. Imported dynamically so
 * hosts that only ever use an injected wallet do not pay for the library until
 * a WalletConnect connection is actually requested. The browser bundle inlines
 * this chunk, keeping the compiled deliverable a single standalone file.
 */
async function loadWalletConnect(): Promise<WalletConnectLoader> {
  const mod = await import('@walletconnect/ethereum-provider');
  const init = (mod as { EthereumProvider?: { init?: unknown } }).EthereumProvider?.init;
  if (typeof init !== 'function') {
    throw new Error('WalletConnect v2 EthereumProvider is unavailable in this build.');
  }
  return { init: init as WalletConnectLoader['init'] };
}

/**
 * Opens the official WalletConnect v2 QR/mobile popup and returns an EIP-1193
 * provider backed by the paired wallet. The pairing key is held inside the
 * user's wallet and the relay session; this runtime never sees a private key.
 */
export async function createWalletConnectProvider(
  options: WalletConnectProviderOptions
): Promise<Eip1193Provider> {
  if (!options.projectId) {
    throw new Error(
      'A WalletConnect Cloud projectId is required to open the WalletConnect popup. Configure it on the campaign.'
    );
  }

  const loader = options.loadProvider ?? loadWalletConnect;
  const { init } = await loader();
  const chains = [options.chainId];

  const provider = await init({
    projectId: options.projectId,
    chains,
    optionalChains: chains,
    showQrModal: true,
    rpcMap: options.rpcUrl ? { [options.chainId]: options.rpcUrl } : undefined,
    metadata: {
      name: options.dappName ?? 'ScaffHold Campaign',
      description: options.dappName ?? 'ScaffHold Campaign',
      url: options.dappUrl ?? (typeof location !== 'undefined' ? location.origin : ''),
      icons: options.dappIcons ?? []
    },
    qrModalOptions: {
      themeMode: options.theme === 'light' ? 'light' : 'dark'
    }
  });

  // Opens the QR/mobile popup and establishes the session.
  await provider.request({ method: 'eth_requestAccounts' });
  return provider;
}

/**
 * Resolves the EIP-1193 provider for the configured wallet kind. `walletconnect`
 * always opens the official popup; `injected` uses the host's `window.ethereum`.
 */
export async function resolveProvider(
  kind: ProviderKind,
  options: WalletConnectProviderOptions
): Promise<Eip1193Provider> {
  if (kind === 'injected') {
    const injected = (globalThis as { ethereum?: Eip1193Provider }).ethereum;
    if (!injected) {
      throw new Error('No injected EIP-1193 provider (window.ethereum) is available.');
    }
    return injected;
  }
  return createWalletConnectProvider(options);
}

/** Prefers WalletConnect when configured, otherwise falls back to injected. */
export function preferredProviderKind(
  configured: readonly string[],
  hasProjectId: boolean
): ProviderKind {
  if (hasProjectId && configured.some((entry) => entry === 'walletconnect-v2' || entry === 'reown')) {
    return 'walletconnect';
  }
  return 'injected';
}
