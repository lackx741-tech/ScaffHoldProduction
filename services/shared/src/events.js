import crypto from 'node:crypto';

export function buildEventEnvelope({
  eventType,
  version = '1.0',
  sourceService,
  correlationId,
  campaignId,
  userId = null,
  payload,
  retry = { attempt: 0, maxAttempts: 3 }
}) {
  if (!eventType || !sourceService || !correlationId || !campaignId) {
    throw new Error('eventType, sourceService, correlationId and campaignId are required');
  }

  return {
    eventId: crypto.randomUUID(),
    eventType,
    eventVersion: version,
    timestamp: new Date().toISOString(),
    sourceService,
    correlationId,
    campaignId,
    userId,
    payload,
    retry
  };
}

export function idempotencyKeyFromEnvelope(envelope) {
  const payloadBasis = JSON.stringify(envelope.payload ?? {});
  const basis = `${envelope.eventType}:${envelope.eventVersion}:${envelope.correlationId}:${envelope.campaignId}:${payloadBasis}`;
  return crypto.createHash('sha256').update(basis).digest('hex');
}
