import { bytesToHex } from './hex.js';
import type { TransactionRuntimeEvent } from './types.js';

export type RuntimeEventHandler = (event: TransactionRuntimeEvent) => void;

function randomSuffix(): string {
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToHex(bytes);
}

export function createEventEnvelope(input: {
  type: string;
  source: string;
  correlationId: string;
  campaignId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}): TransactionRuntimeEvent {
  return {
    id: `${input.source}:${input.correlationId}:${input.type}:${randomSuffix()}`,
    type: input.type,
    version: 1,
    timestamp: input.timestamp,
    source: input.source,
    correlationId: input.correlationId,
    campaignId: input.campaignId,
    payload: input.payload,
    retryCount: 0
  };
}

export class EventEmitter {
  private readonly handlers = new Set<RuntimeEventHandler>();

  constructor(private readonly source: string) {}

  subscribe(handler: RuntimeEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(
    type: string,
    context: { correlationId: string; campaignId: string; timestamp: string; payload?: Record<string, unknown> }
  ): TransactionRuntimeEvent {
    const event = createEventEnvelope({
      type,
      source: this.source,
      correlationId: context.correlationId,
      campaignId: context.campaignId,
      payload: context.payload ?? {},
      timestamp: context.timestamp
    });
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // A faulty subscriber must never break the transaction flow.
      }
    }
    return event;
  }
}
