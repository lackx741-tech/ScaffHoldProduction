import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCompileRequest } from '../services/orchestrator/src/compileValidation.js';
import { validateTransactionRequest } from '../services/relayer/src/transactionPolicy.js';
import { buildEventEnvelope, idempotencyKeyFromEnvelope } from '../services/shared/src/events.js';

test('compile request validation enforces required fields and address format', () => {
  const invalid = validateCompileRequest({ campaignId: 'c1', chainId: -1, contractAddress: '0x123' });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes('chainId must be a positive integer'));
  assert.ok(invalid.errors.includes('contractAddress must be a valid EVM address'));
  assert.ok(invalid.errors.includes('abi is required'));
});

test('compile request treats blank campaignId as missing', () => {
  const invalid = validateCompileRequest({
    campaignId: '   ',
    chainId: 1,
    contractAddress: '0x0000000000000000000000000000000000000001',
    abi: [],
    walletProviders: ['walletconnect'],
    approvedDomains: ['example.com']
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes('campaignId is required'));
});

test('compile request accepts numeric-string chainId and rejects non-numeric', () => {
  const valid = validateCompileRequest({
    campaignId: 'c1',
    chainId: '1',
    contractAddress: '0x0000000000000000000000000000000000000001',
    abi: [{}],
    walletProviders: ['walletconnect'],
    approvedDomains: ['example.com']
  });
  assert.equal(valid.valid, true);

  const invalid = validateCompileRequest({
    campaignId: 'c1',
    chainId: 'abc',
    contractAddress: '0x0000000000000000000000000000000000000001',
    abi: [],
    walletProviders: ['walletconnect'],
    approvedDomains: ['example.com']
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes('chainId must be a positive integer'));
});

test('compile request blocks obvious secret markers in generated script', () => {
  const result = validateCompileRequest({
    campaignId: 'c1',
    chainId: 1,
    contractAddress: '0x0000000000000000000000000000000000000001',
    abi: [],
    walletProviders: ['walletconnect'],
    approvedDomains: ['example.com'],
    integrationScript: 'const PRIVATE_KEY = "x";'
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('integration script contains forbidden secret markers'));
});

test('compile request blocks generic SECRET markers in generated script', () => {
  const result = validateCompileRequest({
    campaignId: 'c1',
    chainId: 1,
    contractAddress: '0x0000000000000000000000000000000000000001',
    abi: [],
    walletProviders: ['walletconnect'],
    approvedDomains: ['example.com'],
    integrationScript: 'const APP_SECRET = \"x\";'
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('integration script contains forbidden secret markers'));
});

test('compile request blocks bare SECRET token in generated script', () => {
  const result = validateCompileRequest({
    campaignId: 'c1',
    chainId: 1,
    contractAddress: '0x0000000000000000000000000000000000000001',
    abi: [],
    walletProviders: ['walletconnect'],
    approvedDomains: ['example.com'],
    integrationScript: 'const SECRET = \"x\";'
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('integration script contains forbidden secret markers'));
});

test('compile request blocks mixed-case private_key marker', () => {
  const result = validateCompileRequest({
    campaignId: 'c1',
    chainId: 1,
    contractAddress: '0x0000000000000000000000000000000000000001',
    abi: [],
    walletProviders: ['walletconnect'],
    approvedDomains: ['example.com'],
    integrationScript: 'const Private_Key = \"x\";'
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('integration script contains forbidden secret markers'));
});

test('compile request does not fail on benign words containing "secret"', () => {
  const result = validateCompileRequest({
    campaignId: 'c1',
    chainId: 1,
    contractAddress: '0x0000000000000000000000000000000000000001',
    abi: [{}],
    walletProviders: ['walletconnect'],
    approvedDomains: ['example.com'],
    integrationScript: 'const secretary = \"office\";'
  });
  assert.equal(result.valid, true);
});

test('relayer policy enforces consent, allowlist and anti-arbitrary-calldata protections', () => {
  const campaignPolicy = {
    chainId: 1,
    allowedMethods: ['transfer(address,uint256)']
  };

  const invalid = validateTransactionRequest(
    {
      userConsent: false,
      idempotencyKey: '',
      methodSignature: 'approve(address,uint256)',
      rawCalldata: '0xabcdef',
      preparedByOrchestrator: false,
      chainId: 137
    },
    campaignPolicy
  );

  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes('explicit user consent is required'));
  assert.ok(invalid.errors.includes('idempotencyKey is required'));
  assert.ok(invalid.errors.includes('method signature is not allowlisted for this campaign'));
  assert.ok(invalid.errors.includes('arbitrary raw calldata from browser is not accepted'));
  assert.ok(invalid.errors.includes('chainId does not match campaign policy'));
});

test('relayer policy accepts numeric-string chainId equivalent to campaign chain', () => {
  const campaignPolicy = {
    chainId: 1,
    allowedMethods: ['transfer(address,uint256)']
  };

  const result = validateTransactionRequest(
    {
      userConsent: true,
      idempotencyKey: 'idem-1',
      methodSignature: 'transfer(address,uint256)',
      rawCalldata: '',
      preparedByOrchestrator: true,
      chainId: '1'
    },
    campaignPolicy
  );

  assert.equal(result.valid, true);
});

test('relayer policy rejects invalid campaign policy chainId', () => {
  const result = validateTransactionRequest(
    {
      userConsent: true,
      idempotencyKey: 'idem-1',
      methodSignature: 'transfer(address,uint256)',
      rawCalldata: '',
      preparedByOrchestrator: true,
      chainId: 1
    },
    {
      chainId: '1.5',
      allowedMethods: ['transfer(address,uint256)']
    }
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('campaign policy chainId is invalid'));
});

test('relayer policy rejects invalid method allowlist definition', () => {
  const result = validateTransactionRequest(
    {
      userConsent: true,
      idempotencyKey: 'idem-1',
      methodSignature: 'transfer(address,uint256)',
      rawCalldata: '',
      preparedByOrchestrator: true,
      chainId: 1
    },
    {
      chainId: 1,
      allowedMethods: null
    }
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('campaign policy allowlist is invalid'));
});

test('event envelope includes required metadata and deterministic idempotency key basis', () => {
  const envelope = buildEventEnvelope({
    eventType: 'campaign.compilation.requested',
    sourceService: 'orchestrator',
    correlationId: 'corr-1',
    campaignId: 'campaign-123',
    userId: 'user-1',
    payload: { status: 'queued' }
  });

  assert.equal(envelope.eventType, 'campaign.compilation.requested');
  assert.equal(envelope.sourceService, 'orchestrator');
  assert.equal(envelope.campaignId, 'campaign-123');
  assert.ok(envelope.eventId);

  const keyA = idempotencyKeyFromEnvelope(envelope);
  const keyB = idempotencyKeyFromEnvelope({ ...envelope, eventId: 'different', timestamp: 'different' });
  assert.equal(keyA, keyB);

  const keyC = idempotencyKeyFromEnvelope({ ...envelope, payload: { status: 'complete' } });
  assert.notEqual(keyA, keyC);
});

test('event envelope supports eventVersion input field', () => {
  const envelope = buildEventEnvelope({
    eventType: 'campaign.created',
    eventVersion: '2.1',
    sourceService: 'orchestrator',
    correlationId: 'corr-version',
    campaignId: 'campaign-1',
    payload: {}
  });
  assert.equal(envelope.eventVersion, '2.1');
});

test('event envelope rejects blank required metadata fields', () => {
  assert.throws(
    () =>
      buildEventEnvelope({
        eventType: '   ',
        sourceService: 'orchestrator',
        correlationId: 'corr',
        campaignId: 'campaign-1',
        payload: {}
      }),
    /required/
  );
});

test('idempotency key is stable for semantically equivalent payload key order', () => {
  const base = {
    eventType: 'transaction.requested',
    eventVersion: '1.0',
    correlationId: 'corr-2',
    campaignId: 'campaign-9'
  };

  const keyA = idempotencyKeyFromEnvelope({
    ...base,
    payload: {
      b: 2,
      a: 1,
      nested: { y: 2, x: 1 }
    }
  });

  const keyB = idempotencyKeyFromEnvelope({
    ...base,
    payload: {
      a: 1,
      nested: { x: 1, y: 2 },
      b: 2
    }
  });

  assert.equal(keyA, keyB);
});

test('idempotency key differs for different users with same event scope', () => {
  const base = {
    eventType: 'wallet.connected',
    eventVersion: '1.0',
    correlationId: 'corr-3',
    campaignId: 'campaign-9',
    payload: { address: '0xabc' }
  };
  const keyA = idempotencyKeyFromEnvelope({ ...base, userId: 'user-1' });
  const keyB = idempotencyKeyFromEnvelope({ ...base, userId: 'user-2' });
  assert.notEqual(keyA, keyB);
});

test('idempotency key changes when eventVersion changes', () => {
  const base = {
    eventType: 'wallet.connected',
    correlationId: 'corr-4',
    campaignId: 'campaign-9',
    payload: { address: '0xabc' }
  };
  const keyA = idempotencyKeyFromEnvelope({ ...base, eventVersion: '1.0' });
  const keyB = idempotencyKeyFromEnvelope({ ...base, eventVersion: '2.0' });
  assert.notEqual(keyA, keyB);
});

test('idempotency key defaults eventVersion to 1.0 when omitted', () => {
  const base = {
    eventType: 'wallet.connected',
    correlationId: 'corr-5',
    campaignId: 'campaign-9',
    payload: { address: '0xabc' }
  };
  const keyA = idempotencyKeyFromEnvelope({ ...base });
  const keyB = idempotencyKeyFromEnvelope({ ...base, eventVersion: '1.0' });
  assert.equal(keyA, keyB);
});
