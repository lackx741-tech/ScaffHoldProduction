export function validateTransactionRequest(request, campaignPolicy) {
  const errors = [];
  const requestChainId = Number(request.chainId);
  const policyChainId = Number(campaignPolicy.chainId);

  if (!request.userConsent) {
    errors.push('explicit user consent is required');
  }

  if (!request.idempotencyKey) {
    errors.push('idempotencyKey is required');
  }

  const methodAllowed = campaignPolicy.allowedMethods.includes(request.methodSignature);
  if (!methodAllowed) {
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
