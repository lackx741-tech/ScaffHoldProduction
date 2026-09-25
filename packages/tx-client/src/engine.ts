import { createDomApproval } from './approval.js';
import { buildDisclosure } from './disclosure.js';
import { EventEmitter } from './events.js';
import {
  GuardrailError,
  assertAbiDeclaresMethod,
  assertCampaignValid,
  assertDomainAllowed,
  assertMethodAllowlisted,
  assertNoArbitraryCalldata,
  assertProviderShape,
  buildCalldataHash,
  deriveCalldata,
  normalizeHex
} from './guardrails.js';
import { deriveIdempotencyKey, IdempotencyStore } from './idempotency.js';
import type {
  ConnectResult,
  HexString,
  PreparedTransaction,
  SendResult,
  TransactionIntent,
  TransactionLifecycleStatus,
  TransactionRecord,
  TransactionRequest,
  TransactionRuntimeEvent,
  TransactionRuntimeOptions
} from './types.js';
import { WalletAdapter } from './wallet.js';

const DEFAULT_CONFIRMATIONS = 1;

export class TransactionEngine {
  readonly campaign: TransactionRuntimeOptions['campaign'];
  private readonly wallet: WalletAdapter;
  private readonly events: EventEmitter;
  private readonly idempotency = new IdempotencyStore();
  private readonly records = new Map<string, TransactionRecord>();
  private readonly requestApproval: (intent: TransactionIntent) => Promise<boolean>;
  private readonly options: TransactionRuntimeOptions;
  private connected = false;

  constructor(options: TransactionRuntimeOptions) {
    assertCampaignValid(options.campaign);
    assertProviderShape(options.provider);
    assertNoArbitraryCalldata({ methodSignature: '' } as TransactionRequest);

    const hostname = options.hostname ?? currentHostname();
    if (hostname) {
      assertDomainAllowed(hostname, options.campaign.approvedDomains);
    }

    this.options = options;
    this.campaign = options.campaign;
    this.wallet = new WalletAdapter(options.provider);
    this.events = new EventEmitter('tx-client');
    this.requestApproval = options.requestApproval ?? createDomApproval();

    if (options.onEvent) {
      this.events.subscribe(options.onEvent);
    }
  }

  onEvent(handler: (event: TransactionRuntimeEvent) => void): () => void {
    return this.events.subscribe(handler);
  }

  async connect(): Promise<ConnectResult> {
    const result = await this.wallet.connect();
    if (result.chainId !== this.campaign.chainId) {
      await this.wallet.switchChain(this.campaign.chainId);
      const confirmed = await this.wallet.getChainId();
      if (confirmed !== this.campaign.chainId) {
        throw new GuardrailError(
          'wrong_chain',
          `Wallet is on chain ${confirmed} but the campaign requires ${this.campaign.chainId}.`
        );
      }
    }
    this.connected = true;
    return { address: result.address, chainId: this.campaign.chainId };
  }

  getTransaction(id: string): TransactionRecord | undefined {
    return this.records.get(id);
  }

  getTransactionByIdempotencyKey(key: string): TransactionRecord | undefined {
    const record = this.idempotency.get(key);
    return record ? this.records.get(record.transactionId) : undefined;
  }

  /**
   * Validates the request, derives calldata from the allowlisted method + ABI,
   * estimates gas, and simulates read-only. Nothing is signed here.
   */
  async prepare(request: TransactionRequest): Promise<PreparedTransaction> {
    const timestamp = this.timestamp();
    const correlationId = this.correlationId(request);

    assertNoArbitraryCalldata(request);
    assertMethodAllowlisted(this.campaign, request.methodSignature);
    assertAbiDeclaresMethod(this.campaign, request.methodSignature);

    const args = request.args ?? [];
    const valueWei = toWei(request.value);
    const data = deriveCalldata(this.campaign, request.methodSignature, args);

    const from = (await this.wallet.getAccounts())[0];
    if (!from) {
      throw new GuardrailError('wallet_not_connected', 'Connect a wallet before preparing a transaction.');
    }

    const to = normalizeHex(this.campaign.contract.address);
    const transaction = { from, to, data, value: toQuantity(valueWei) };

    const idempotencyKey =
      request.idempotencyKey ??
      deriveIdempotencyKey({
        campaignId: this.campaign.campaignId,
        chainId: this.campaign.chainId,
        from,
        to,
        methodSignature: request.methodSignature,
        args,
        valueWei: valueWei.toString()
      });

    const existing = this.idempotency.get(idempotencyKey);
    if (existing && isInFlight(existing.status as TransactionLifecycleStatus)) {
      throw new GuardrailError(
        'duplicate_submission',
        `A transaction for this intent is already ${existing.status} (${existing.transactionId}).`
      );
    }

    const calldataHash = buildCalldataHash(
      this.campaign.campaignId,
      this.campaign.chainId,
      to,
      request.methodSignature,
      args,
      data
    );

    const intentBase = {
      campaignId: this.campaign.campaignId,
      chainId: this.campaign.chainId,
      from,
      to,
      methodSignature: request.methodSignature,
      args,
      data,
      valueWei,
      gasEstimate: 0n,
      calldataHash,
      idempotencyKey
    };

    const intent: TransactionIntent = {
      ...intentBase,
      gasEstimate: await this.wallet.estimateGas({ ...transaction, data }),
      ...buildDisclosure(this.campaign, intentBase)
    };

    this.events.emit('transaction.requested', {
      correlationId,
      campaignId: this.campaign.campaignId,
      timestamp,
      payload: { idempotencyKey, methodSignature: request.methodSignature, calldataHash }
    });

    await this.validateWithServer(intent, correlationId, timestamp);

    this.events.emit('transaction.validated', {
      correlationId,
      campaignId: this.campaign.campaignId,
      timestamp,
      payload: { idempotencyKey, gasEstimate: intent.gasEstimate.toString() }
    });

    const simulation = await this.simulate(intent);
    this.events.emit('transaction.simulated', {
      correlationId,
      campaignId: this.campaign.campaignId,
      timestamp,
      payload: { idempotencyKey, ok: simulation.ok }
    });

    return { intent, simulation };
  }

  /** Read-only `eth_call`. Failures surface as SIMULATION_FAILED, never as a broadcast. */
  private async simulate(intent: TransactionIntent): Promise<{ ok: boolean; returnData: HexString }> {
    try {
      const returnData = await this.wallet.callTransaction({
        from: intent.from,
        to: intent.to,
        data: intent.data,
        value: toQuantity(intent.valueWei)
      });
      return { ok: true, returnData };
    } catch (error) {
      throw new GuardrailError(
        'simulation_failed',
        `Simulation reverted: ${(error as Error)?.message ?? 'unknown error'}`
      );
    }
  }

  /** Presents disclosure and captures explicit user consent. Returns false if rejected. */
  async approve(prepared: PreparedTransaction): Promise<boolean> {
    const timestamp = this.timestamp();
    const record = this.ensureRecord(prepared);
    this.transition(record, 'AWAITING_USER_APPROVAL', timestamp);

    const approved = await this.requestApproval(prepared.intent);
    if (!approved) {
      this.transition(record, 'USER_CANCELLED', this.timestamp());
      return false;
    }
    return true;
  }

  /** Submits through the connected wallet only. The runtime never holds a key. */
  async send(prepared: PreparedTransaction): Promise<SendResult> {
    const record = this.ensureRecord(prepared);
    const intent = prepared.intent;

    try {
      const txHash = await this.wallet.sendTransaction({
        from: intent.from,
        to: intent.to,
        data: intent.data,
        value: toQuantity(intent.valueWei)
      });
      record.txHash = txHash;
      this.transition(record, 'SUBMITTED', this.timestamp());
      this.transition(record, 'PENDING', this.timestamp());
      return { id: record.id, status: record.status, txHash };
    } catch (error) {
      const code = (error as { code?: number })?.code;
      const cancelled = code === 4001;
      record.error = { code: cancelled ? 'user_rejected_wallet' : 'submission_failed', message: messageOf(error) };
      this.transition(record, cancelled ? 'USER_CANCELLED' : 'SUBMISSION_FAILED', this.timestamp());
      return { id: record.id, status: record.status };
    }
  }

  /** Full pipeline: prepare → approve → send. Returns the tracked record. */
  async execute(request: TransactionRequest): Promise<TransactionRecord> {
    const prepared = await this.prepare(request);
    const approved = await this.approve(prepared);
    if (!approved) {
      return this.requireRecord(prepared);
    }
    await this.send(prepared);
    return this.requireRecord(prepared);
  }

  /** Polls the receipt until confirmed or the attempt budget runs out. */
  async waitForConfirmation(
    id: string,
    options: { pollIntervalMs?: number; maxAttempts?: number } = {}
  ): Promise<TransactionRecord> {
    const record = this.records.get(id);
    if (!record) {
      throw new GuardrailError('unknown_transaction', `No transaction tracked with id ${id}.`);
    }
    if (!record.txHash) {
      return record;
    }

    const pollIntervalMs = options.pollIntervalMs ?? 4000;
    const maxAttempts = options.maxAttempts ?? 30;
    const required = this.campaign.confirmationsRequired ?? DEFAULT_CONFIRMATIONS;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const receipt = await this.wallet.getTransactionReceipt(record.txHash);
      if (receipt) {
        const head = await this.wallet.getBlockNumber();
        record.blockNumber = receipt.blockNumber;
        if (head - receipt.blockNumber + 1 >= required) {
          this.transition(record, 'CONFIRMED', this.timestamp());
          return record;
        }
      }
      if (pollIntervalMs > 0) {
        await delay(pollIntervalMs);
      }
    }

    this.transition(record, 'EXPIRED', this.timestamp());
    return record;
  }

  private async validateWithServer(
    intent: TransactionIntent,
    correlationId: string,
    timestamp: string
  ): Promise<void> {
    if (!this.options.prepareEndpoint) {
      return;
    }
    const fetchImpl = this.options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      return;
    }
    const response = await fetchImpl(this.options.prepareEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        campaignId: intent.campaignId,
        chainId: intent.chainId,
        contractAddress: intent.to,
        methodSignature: intent.methodSignature,
        calldataHash: intent.calldataHash,
        idempotencyKey: intent.idempotencyKey
      })
    });

    if (!response.ok) {
      this.events.emit('transaction.rejected', {
        correlationId,
        campaignId: this.campaign.campaignId,
        timestamp,
        payload: { idempotencyKey: intent.idempotencyKey, status: response.status }
      });
      throw new GuardrailError(
        'server_rejected',
        `Server relayer rejected the transaction (HTTP ${response.status}).`
      );
    }
  }

  private ensureRecord(prepared: PreparedTransaction): TransactionRecord {
    const key = prepared.intent.idempotencyKey;
    const existing = this.idempotency.get(key);
    if (existing) {
      const record = this.records.get(existing.transactionId);
      if (record) {
        return record;
      }
    }

    const id = `tx_${key.slice(2, 18)}`;
    const timestamp = this.timestamp();
    const record: TransactionRecord = {
      id,
      idempotencyKey: key,
      status: 'REQUESTED',
      intent: prepared.intent,
      history: []
    };
    this.records.set(id, record);
    this.idempotency.begin(key, id, 'REQUESTED', timestamp);
    this.transition(record, 'VALIDATED', timestamp);
    this.transition(record, 'SIMULATED', timestamp);
    return record;
  }

  private requireRecord(prepared: PreparedTransaction): TransactionRecord {
    const record = this.ensureRecord(prepared);
    return record;
  }

  private transition(record: TransactionRecord, status: TransactionLifecycleStatus, timestamp: string): void {
    record.status = status;
    record.history.push({ status, timestamp });
    this.idempotency.update(record.idempotencyKey, status, timestamp);
    this.events.emit(`transaction.status.updated`, {
      correlationId: record.idempotencyKey,
      campaignId: this.campaign.campaignId,
      timestamp,
      payload: { transactionId: record.id, status, txHash: record.txHash, error: record.error }
    });
  }

  private timestamp(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }

  private correlationId(request: TransactionRequest): string {
    return request.idempotencyKey ?? `${this.campaign.campaignId}:${this.timestamp()}`;
  }
}

function currentHostname(): string | undefined {
  return typeof globalThis.location !== 'undefined' ? globalThis.location.hostname : undefined;
}

function toWei(value: bigint | number | string | undefined): bigint {
  if (value === undefined) {
    return 0n;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new GuardrailError('invalid_value', 'Transaction value must be an integer in wei.');
    }
    return BigInt(value);
  }
  return BigInt(value);
}

function toQuantity(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function isInFlight(status: TransactionLifecycleStatus): boolean {
  return ['REQUESTED', 'VALIDATED', 'SIMULATED', 'AWAITING_USER_APPROVAL', 'SIGNED', 'SUBMITTED', 'PENDING'].includes(
    status
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
