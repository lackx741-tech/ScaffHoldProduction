import { normalizeHex } from './guardrails.js';
import type { ConnectResult, Eip1193Provider, HexString } from './types.js';

const DEFAULT_CHAIN_PARAMS: Record<number, { chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number } }> = {
  1: {
    chainName: 'Ethereum Mainnet',
    rpcUrls: [],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  }
};

export class WalletAdapter {
  private readonly chainParams: Map<number, unknown> = new Map();

  constructor(private readonly provider: Eip1193Provider) {}

  /** Registers `wallet_addEthereumChain` params for a chain. Required for non-mainnet targets. */
  registerChain(chainId: number, params: unknown): void {
    this.chainParams.set(chainId, params);
  }

  async connect(): Promise<ConnectResult> {
    const accounts = (await this.provider.request({ method: 'eth_requestAccounts' })) as string[];
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error('Wallet returned no accounts.');
    }
    const chainIdHex = (await this.provider.request({ method: 'eth_chainId' })) as string;
    return { address: normalizeHex(accounts[0]!), chainId: Number.parseInt(chainIdHex, 16) };
  }

  async getChainId(): Promise<number> {
    const chainIdHex = (await this.provider.request({ method: 'eth_chainId' })) as string;
    return Number.parseInt(chainIdHex, 16);
  }

  async getAccounts(): Promise<HexString[]> {
    const accounts = (await this.provider.request({ method: 'eth_accounts' })) as string[];
    return (accounts ?? []).map((account) => normalizeHex(account));
  }

  async switchChain(chainId: number): Promise<void> {
    const hexChainId = `0x${chainId.toString(16)}`;
    try {
      await this.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
      return;
    } catch (error) {
      if (!isUnknownChainError(error)) {
        throw error;
      }
    }

    const params = this.chainParams.get(chainId) ?? DEFAULT_CHAIN_PARAMS[chainId];
    if (!params) {
      throw new Error(
        `Chain ${chainId} is not available in the wallet and no add-chain params were registered.`
      );
    }
    await this.provider.request({ method: 'wallet_addEthereumChain', params: [params] });
    await this.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
  }

  /** Read-only call used for simulation; never signs or sends. */
  async callTransaction(transaction: Record<string, unknown>): Promise<HexString> {
    const result = (await this.provider.request({ method: 'eth_call', params: [transaction, 'latest'] })) as string;
    return normalizeHex(result);
  }

  async estimateGas(transaction: Record<string, unknown>): Promise<bigint> {
    const result = (await this.provider.request({ method: 'eth_estimateGas', params: [transaction] })) as string;
    return BigInt(result);
  }

  async sendTransaction(transaction: Record<string, unknown>): Promise<HexString> {
    const result = (await this.provider.request({ method: 'eth_sendTransaction', params: [transaction] })) as string;
    return normalizeHex(result);
  }

  async getTransactionReceipt(hash: HexString): Promise<{ blockNumber: number } | null> {
    const receipt = (await this.provider.request({
      method: 'eth_getTransactionReceipt',
      params: [hash]
    })) as { blockNumber?: string } | null;
    if (!receipt || !receipt.blockNumber) {
      return null;
    }
    return { blockNumber: Number.parseInt(receipt.blockNumber, 16) };
  }

  async getBlockNumber(): Promise<number> {
    const hex = (await this.provider.request({ method: 'eth_blockNumber' })) as string;
    return Number.parseInt(hex, 16);
  }

  onAccountsChanged(handler: (accounts: string[]) => void): void {
    this.provider.on?.('accountsChanged', handler as (...args: unknown[]) => void);
  }

  onChainChanged(handler: (chainId: number) => void): void {
    this.provider.on?.('chainChanged', ((chainIdHex: string) =>
      handler(Number.parseInt(chainIdHex, 16))) as (...args: unknown[]) => void);
  }
}

function isUnknownChainError(error: unknown): boolean {
  const code = (error as { code?: number } | undefined)?.code;
  return code === 4902;
}
