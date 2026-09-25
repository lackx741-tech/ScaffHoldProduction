export interface WalletProviderConfig {
  projectId?: string;
  rpcUrl?: string;
  metadata?: Record<string, string>;
}

export interface WalletConnection {
  account: string;
  chainId: number;
}

export interface TransactionRequest {
  to: string;
  data: string;
  value?: string;
}

export interface SignedTransaction {
  rawTransaction: string;
}

export interface WalletProviderAdapter {
  id: string;
  displayName: string;
  initialize(config: WalletProviderConfig): Promise<void>;
  connect(): Promise<WalletConnection>;
  disconnect(): Promise<void>;
  getAccount(): Promise<string | null>;
  getChainId(): Promise<number | null>;
  switchChain(chainId: number): Promise<void>;
  signTransaction(request: TransactionRequest): Promise<SignedTransaction>;
}
