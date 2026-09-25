import { bytesToHex } from './hex.js';
import { keccak256 } from './keccak.js';

export interface IdempotencyRecord {
  key: string;
  transactionId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function deriveIdempotencyKey(input: {
  campaignId: string;
  chainId: number;
  from: string;
  to: string;
  methodSignature: string;
  args: unknown[];
  valueWei: string;
  nonce?: string;
}): string {
  const normalized = JSON.stringify([
    input.campaignId,
    input.chainId,
    input.from.toLowerCase(),
    input.to.toLowerCase(),
    input.methodSignature,
    input.args,
    input.valueWei,
    input.nonce ?? null
  ]);
  return `0x${bytesToHex(keccak256(new TextEncoder().encode(normalized)))}`;
}

/**
 * In-memory idempotency guard so a double click cannot submit two wallet
 * transactions for the same intent, and retries can reuse a completed result.
 * It is intentionally process-local: the server relayer holds the durable copy.
 */
export class IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  get(key: string): IdempotencyRecord | undefined {
    return this.records.get(key);
  }

  has(key: string): boolean {
    return this.records.has(key);
  }

  begin(key: string, transactionId: string, status: string, timestamp: string): IdempotencyRecord {
    const existing = this.records.get(key);
    if (existing) {
      return existing;
    }
    const record: IdempotencyRecord = {
      key,
      transactionId,
      status,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.records.set(key, record);
    return record;
  }

  update(key: string, status: string, timestamp: string): IdempotencyRecord | undefined {
    const record = this.records.get(key);
    if (!record) {
      return undefined;
    }
    record.status = status;
    record.updatedAt = timestamp;
    return record;
  }

  clear(): void {
    this.records.clear();
  }
}
