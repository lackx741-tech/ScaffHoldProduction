// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://app.example.com/" }
import { describe, expect, it, vi } from 'vitest';
import {
  createWalletConnectProvider,
  preferredProviderKind,
  resolveProvider
} from '../packages/tx-client/src/walletconnect.js';

describe('WalletConnect v2 provider layer', () => {
  it('selects WalletConnect when a project id and a WC provider are configured', () => {
    expect(preferredProviderKind(['walletconnect-v2', 'injected'], true)).toBe('walletconnect');
    expect(preferredProviderKind(['reown'], true)).toBe('walletconnect');
    // No project id means the popup cannot open, so fall back to injected.
    expect(preferredProviderKind(['walletconnect-v2'], false)).toBe('injected');
    expect(preferredProviderKind(['injected'], true)).toBe('injected');
  });

  it('requires a project id before attempting to open the popup', async () => {
    const loadProvider = vi.fn();
    await expect(
      createWalletConnectProvider({ projectId: '', chainId: 1, loadProvider })
    ).rejects.toThrow(/projectId is required/);
    expect(loadProvider).not.toHaveBeenCalled();
  });

  it('initializes WalletConnect with the configured chain, RPC and theme, then opens the popup', async () => {
    const request = vi.fn(async () => ['0xAbC0000000000000000000000000000000000001']);
    const init = vi.fn(async () => ({ request }));

    const provider = await createWalletConnectProvider({
      projectId: 'wc_project_123',
      chainId: 137,
      rpcUrl: 'https://polygon-rpc.com',
      dappName: 'Launch Alpha',
      theme: 'dark',
      loadProvider: async () => ({ init })
    });

    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0]![0] as Record<string, unknown>;
    expect(options.projectId).toBe('wc_project_123');
    expect(options.chains).toEqual([137]);
    expect(options.showQrModal).toBe(true);
    expect(options.rpcMap).toEqual({ 137: 'https://polygon-rpc.com' });
    expect((options.qrModalOptions as { themeMode: string }).themeMode).toBe('dark');
    expect((options.metadata as { name: string }).name).toBe('Launch Alpha');

    // Opening the QR/mobile popup establishes the session.
    expect(request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
    expect(provider).toBeDefined();
  });

  it('uses the light QR modal theme when configured', async () => {
    const init = vi.fn(async () => ({ request: vi.fn(async () => ['0x1']) }));
    await createWalletConnectProvider({
      projectId: 'wc_project_123',
      chainId: 1,
      theme: 'light',
      loadProvider: async () => ({ init })
    });
    const options = init.mock.calls[0]![0] as Record<string, unknown>;
    expect((options.qrModalOptions as { themeMode: string }).themeMode).toBe('light');
  });

  it('resolves the injected provider when configured, and errors when absent', async () => {
    delete (globalThis as unknown as { ethereum?: unknown }).ethereum;
    await expect(resolveProvider('injected', { projectId: 'x', chainId: 1 })).rejects.toThrow(
      /No injected EIP-1193 provider/
    );

    const fake = { request: async () => '0x1' };
    (globalThis as unknown as { ethereum: unknown }).ethereum = fake;
    await expect(resolveProvider('injected', { projectId: 'x', chainId: 1 })).resolves.toBe(fake);
  });
});
