export function validateTransactionRequest(request, campaignPolicy) {
  const errors = [];
  const requestChainId = Number(request.chainId);
  const policyChainId = Number(campaignPolicy.chainId);
  const allowedMethods = Array.isArray(campaignPolicy.allowedMethods) ? campaignPolicy.allowedMethods : null;

  if (!request.userConsent) {
    errors.push('explicit user consent is required');
  }

  if (!request.idempotencyKey) {
    errors.push('idempotencyKey is required');
  }

  if (!allowedMethods) {
    errors.push('campaign policy allowlist is invalid');
  } else if (!allowedMethods.includes(request.methodSignature)) {
    errors.push('method signature is not allowlisted for this campaign');
  }

  if (request.rawCalldata && !request.preparedByOrchestrator) {
    errors.push('arbitrary raw calldata from browser is not accepted');
  }

  if (!Number.isInteger(policyChainId) || policyChainId <= 0) {
    errors.push('campaign policy chainId is invalid');
  } else if (!Number.isInteger(requestChainId) || requestChainId !== policyChainId) {
    errors.push('chainId does not match campaign policy');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
