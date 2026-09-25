/** Client-side transaction lifecycle, mirroring the spec's §8.2 state machine. */
export type TransactionLifecycleStatus =
  | 'REQUESTED'
  | 'VALIDATED'
  | 'SIMULATED'
  | 'AWAITING_USER_APPROVAL'
  | 'SIGNED'
  | 'SUBMITTED'
  | 'PENDING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'SIMULATION_FAILED'
  | 'USER_CANCELLED'
  | 'SUBMISSION_FAILED'
  | 'REPLACED'
  | 'EXPIRED'
  | 'REVERTED';

export const TERMINAL_STATUSES: readonly TransactionLifecycleStatus[] = [
  'CONFIRMED',
  'REJECTED',
  'SIMULATION_FAILED',
  'USER_CANCELLED',
  'SUBMISSION_FAILED',
  'REPLACED',
  'EXPIRED',
  'REVERTED'
];

export type HexString = `0x${string}`;

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface RuntimeAbiItem {
  name: string;
  type: string;
  inputs?: Array<{ name: string; type: string }>;
}

export interface RuntimeContract {
  address: HexString;
  abi: RuntimeAbiItem[];
  allowedMethods: string[];
}

export interface RuntimeCampaign {
  campaignId: string;
  name: string;
  environment: 'development' | 'staging' | 'production';
  chainId: number;
  contract: RuntimeContract;
  approvedDomains: string[];
  walletProviders: string[];
  transactionPolicy: {
    userConsentRequired: true;
    relayerEnabled: boolean;
    signingMode: 'client-wallet';
  };
  /** Blocks to wait before a SUBMITTED transaction is treated as CONFIRMED. */
  confirmationsRequired?: number;
}

export interface TransactionRequest {
  methodSignature: string;
  args?: unknown[];
  value?: bigint | number | string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface TransactionIntent {
  campaignId: string;
  chainId: number;
  from: HexString;
  to: HexString;
  methodSignature: string;
  args: unknown[];
  data: HexString;
  valueWei: bigint;
  gasEstimate: bigint;
  calldataHash: HexString;
  idempotencyKey: string;
  /** Human-readable disclosure lines the end user must see before approving. */
  disclosure: string[];
  /** Wallet permissions or assets the transaction touches. */
  assetEffects: string[];
}

export interface TransactionRecord {
  id: string;
  idempotencyKey: string;
  status: TransactionLifecycleStatus;
  intent: TransactionIntent;
  txHash?: HexString;
  blockNumber?: number;
  error?: { code: string; message: string };
  history: Array<{ status: TransactionLifecycleStatus; timestamp: string }>;
}

export interface TransactionRuntimeEvent {
  id: string;
  type: string;
  version: 1;
  timestamp: string;
  source: string;
  correlationId: string;
  campaignId: string;
  payload: Record<string, unknown>;
  retryCount: number;
}

export interface ApprovalPresentation extends TransactionIntent {
  /** Resolves true only when the end user explicitly confirms. */
  requestApproval: (intent: TransactionIntent) => Promise<boolean>;
}

export interface TransactionRuntimeOptions {
  campaign: RuntimeCampaign;
  provider: Eip1193Provider;
  /** Overrides document-based approval UI (used by tests and custom hosts). */
  requestApproval?: (intent: TransactionIntent) => Promise<boolean>;
  /** Optional server relayer for a second validation pass before wallet submission. */
  prepareEndpoint?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  onEvent?: (event: TransactionRuntimeEvent) => void;
  /** Overrides `document.location.hostname`; requires an approved domain when set. */
  hostname?: string;
}

export interface ConnectResult {
  address: HexString;
  chainId: number;
}

export interface PreparedTransaction {
  intent: TransactionIntent;
  /** Result of the read-only `eth_call` simulation. */
  simulation: { ok: boolean; returnData: HexString };
}

export interface SendResult {
  id: string;
  status: TransactionLifecycleStatus;
  txHash?: HexString;
}
