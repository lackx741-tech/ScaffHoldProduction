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
  from?: string;
  to: string;
  data?: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
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
