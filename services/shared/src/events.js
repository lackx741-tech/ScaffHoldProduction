import crypto from 'node:crypto';

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalize(value[key]);
        return acc;
      }, {});
  }
  return value;
}

export function buildEventEnvelope({
  eventType,
  eventVersion = '1.0',
  sourceService,
  correlationId,
  campaignId,
  userId = null,
  payload,
  retry = { attempt: 0, maxAttempts: 3 }
}) {
  const isBlank = (value) => typeof value === 'string' && value.trim() === '';
  if (!eventType || !sourceService || !correlationId || !campaignId || isBlank(eventType) || isBlank(sourceService) || isBlank(correlationId) || isBlank(campaignId)) {
    throw new Error('eventType, sourceService, correlationId and campaignId are required');
  }

  return {
    eventId: crypto.randomUUID(),
    eventType,
    eventVersion,
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
  const payloadBasis = JSON.stringify(normalize(envelope.payload ?? {}));
  const basis = `${envelope.eventType}:${envelope.eventVersion}:${envelope.correlationId}:${envelope.campaignId}:${envelope.userId ?? ''}:${payloadBasis}`;
  return crypto.createHash('sha256').update(basis).digest('hex');
}
