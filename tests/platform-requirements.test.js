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
