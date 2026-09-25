import { describe, expect, it } from 'vitest';
import {
  GuardrailError,
  TransactionEngine,
  assertDomainAllowed,
  assertNoSecretMarkers,
  deriveIdempotencyKey,
  encodeFunctionData,
  isMethodAllowlisted
} from '../packages/tx-client/src/index';
import type { Eip1193Provider, RuntimeCampaign, TransactionRuntimeEvent } from '../packages/tx-client/src/index';

const campaign: RuntimeCampaign = {
  campaignId: 'cmp_launch_alpha',
  name: 'Launch Alpha',
  environment: 'development',
  chainId: 1,
  contract: {
    address: '0x1111111111111111111111111111111111111111',
    abi: [{ name: 'mint', type: 'function', inputs: [{ name: 'amount', type: 'uint256' }] }],
    allowedMethods: ['mint(uint256)']
  },
  approvedDomains: ['app.example.com'],
  walletProviders: ['reown'],
  transactionPolicy: { userConsentRequired: true, relayerEnabled: false, signingMode: 'client-wallet' }
};

const FROM = '0x2222222222222222222222222222222222222222';
const TX_HASH = '0xabc0000000000000000000000000000000000000000000000000000000000001';

interface ProviderLog {
  calls: Array<{ method: string; params?: unknown }>;
}

function createMockProvider(log: ProviderLog, overrides: Partial<Record<string, unknown>> = {}): Eip1193Provider {
  return {
    async request({ method, params }) {
      log.calls.push({ method, params });
      if (method in overrides) {
        const value = overrides[method];
        return typeof value === 'function' ? (value as (p?: unknown) => unknown)(params) : value;
      }
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [FROM];
        case 'eth_chainId':
          return '0x1';
        case 'eth_estimateGas':
          return '0x5208';
        case 'eth_call':
          return '0x';
        case 'eth_sendTransaction':
          return TX_HASH;
        case 'eth_getTransactionReceipt':
          return { blockNumber: '0x10' };
        case 'eth_blockNumber':
          return '0x10';
        default:
          throw new Error(`Unhandled provider method ${method}`);
      }
    }
  };
}

function countCalls(log: ProviderLog, method: string): number {
  return log.calls.filter((call) => call.method === method).length;
}

describe('guardrails', () => {
  it('allows exact and subdomain matches only', () => {
    expect(() => assertDomainAllowed('app.example.com', ['app.example.com'])).not.toThrow();
    expect(() => assertDomainAllowed('shop.app.example.com', ['app.example.com'])).not.toThrow();
    expect(() => assertDomainAllowed('evil-app.example.com', ['app.example.com'])).toThrow(GuardrailError);
    expect(() => assertDomainAllowed('example.com.attacker.net', ['app.example.com'])).toThrow(/not in the campaign allowlist/);
  });

  it('detects secret material in config', () => {
    expect(() => assertNoSecretMarkers({ ok: true })).not.toThrow();
    expect(() => assertNoSecretMarkers({ relayerPrivateKey: '0xdead' })).toThrow(/must not contain private keys/);
    expect(() => assertNoSecretMarkers({ url: 'postgres://user:pass@host/db' })).toThrow(/private keys/);
  });

  it('matches allowlisted methods with normalization', () => {
    expect(isMethodAllowlisted(campaign, 'mint(uint256)')).toBe(true);
    expect(isMethodAllowlisted(campaign, 'mint(uint)')).toBe(true);
    expect(isMethodAllowlisted(campaign, 'burn(uint256)')).toBe(false);
  });

  it('rejects arbitrary calldata during send', async () => {
    const engine = new TransactionEngine({
      campaign,
      hostname: 'app.example.com',
      provider: createMockProvider({ calls: [] }),
      requestApproval: async () => true
    });

    await expect(
      engine.prepare({ methodSignature: 'mint(uint256)', args: [1], calldata: '0xdeadbeef' } as never)
    ).rejects.toThrow(/Raw calldata cannot be supplied/);
  });

  it('rejects a non-allowlisted method before touching the wallet', async () => {
    const log: ProviderLog = { calls: [] };
    const engine = new TransactionEngine({
      campaign,
      hostname: 'app.example.com',
      provider: createMockProvider(log),
      requestApproval: async () => true
    });

    await expect(engine.prepare({ methodSignature: 'burn(uint256)', args: [1] })).rejects.toThrow(
      /not allowlisted/
    );
    expect(countCalls(log, 'eth_estimateGas')).toBe(0);
  });

  it('throws when constructed from an unapproved domain', () => {
    expect(
      () =>
        new TransactionEngine({
          campaign,
          hostname: 'attacker.net',
          provider: createMockProvider({ calls: [] }),
          requestApproval: async () => true
        })
    ).toThrow(/not in the campaign allowlist/);
  });
});

describe('transaction engine lifecycle', () => {
  it('derives calldata, estimates gas, simulates, and never prepares with raw calldata', async () => {
    const log: ProviderLog = { calls: [] };
    const engine = new TransactionEngine({
      campaign,
      hostname: 'app.example.com',
      provider: createMockProvider(log),
      requestApproval: async () => true
    });

    const prepared = await engine.prepare({ methodSignature: 'mint(uint256)', args: [1] });

    expect(prepared.intent.data).toBe(encodeFunctionData('mint(uint256)', [1]));
    expect(prepared.intent.gasEstimate).toBe(21000n);
    expect(prepared.simulation.ok).toBe(true);
    expect(prepared.intent.disclosure.join(' ')).toContain('Contract: 0x1111111111111111111111111111111111111111');
    expect(prepared.intent.disclosure.length).toBeGreaterThanOrEqual(5);
    expect(countCalls(log, 'eth_sendTransaction')).toBe(0);
  });

  it('does not submit a transaction when the user rejects approval', async () => {
    const log: ProviderLog = { calls: [] };
    const events: TransactionRuntimeEvent[] = [];
    const engine = new TransactionEngine({
      campaign,
      hostname: 'app.example.com',
      provider: createMockProvider(log),
      requestApproval: async () => false,
      onEvent: (event) => events.push(event)
    });

    await engine.connect();
    const record = await engine.execute({ methodSignature: 'mint(uint256)', args: [1] });

    expect(record.status).toBe('USER_CANCELLED');
    expect(countCalls(log, 'eth_sendTransaction')).toBe(0);
    expect(events.map((event) => event.type)).toContain('transaction.status.updated');
  });

  it('runs the full happy path to CONFIRMED', async () => {
    const log: ProviderLog = { calls: [] };
    const engine = new TransactionEngine({
      campaign,
      hostname: 'app.example.com',
      provider: createMockProvider(log),
      requestApproval: async () => true
    });

    await engine.connect();
    const record = await engine.execute({ methodSignature: 'mint(uint256)', args: [1] });
    expect(record.txHash).toBe(TX_HASH);

    const confirmed = await engine.waitForConfirmation(record.id, { pollIntervalMs: 0, maxAttempts: 3 });
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.history.map((entry) => entry.status)).toEqual([
      'VALIDATED',
      'SIMULATED',
      'AWAITING_USER_APPROVAL',
      'SUBMITTED',
      'PENDING',
      'CONFIRMED'
    ]);
    expect(countCalls(log, 'eth_sendTransaction')).toBe(1);
  });

  it('blocks duplicate submissions for the same idempotency key', async () => {
    const log: ProviderLog = { calls: [] };
    const engine = new TransactionEngine({
      campaign,
      hostname: 'app.example.com',
      provider: createMockProvider(log),
      requestApproval: async () => true
    });

    await engine.connect();
    await engine.execute({ methodSignature: 'mint(uint256)', args: [7], idempotencyKey: 'fixed-key' });

    await expect(
      engine.prepare({ methodSignature: 'mint(uint256)', args: [7], idempotencyKey: 'fixed-key' })
    ).rejects.toThrow(/already/);
    expect(countCalls(log, 'eth_sendTransaction')).toBe(1);
  });

  it('surfaces a simulation revert without signing', async () => {
    const log: ProviderLog = { calls: [] };
    const engine = new TransactionEngine({
      campaign,
      hostname: 'app.example.com',
      provider: createMockProvider(log, {
        eth_call: () => {
          throw new Error('execution reverted');
        }
      }),
      requestApproval: async () => true
    });

    await engine.connect();
    await expect(engine.prepare({ methodSignature: 'mint(uint256)', args: [1] })).rejects.toThrow(/Simulation reverted/);
    expect(countCalls(log, 'eth_sendTransaction')).toBe(0);
  });

  it('records user wallet rejection as USER_CANCELLED', async () => {
    const log: ProviderLog = { calls: [] };
    const engine = new TransactionEngine({
      campaign,
      hostname: 'app.example.com',
      provider: createMockProvider(log, {
        eth_sendTransaction: () => {
          const error = new Error('User rejected the request.') as Error & { code: number };
          error.code = 4001;
          throw error;
        }
      }),
      requestApproval: async () => true
    });

    await engine.connect();
    const record = await engine.execute({ methodSignature: 'mint(uint256)', args: [1] });
    expect(record.status).toBe('USER_CANCELLED');
  });
});

describe('idempotency key derivation', () => {
  it('is stable for identical intents and distinct across value changes', () => {
    const base = {
      campaignId: 'c',
      chainId: 1,
      from: FROM,
      to: campaign.contract.address,
      methodSignature: 'mint(uint256)',
      args: [1],
      valueWei: '0'
    };
    expect(deriveIdempotencyKey(base)).toBe(deriveIdempotencyKey({ ...base }));
    expect(deriveIdempotencyKey(base)).not.toBe(deriveIdempotencyKey({ ...base, args: [2] }));
    expect(deriveIdempotencyKey(base)).not.toBe(deriveIdempotencyKey({ ...base, valueWei: '1' }));
  });
});
