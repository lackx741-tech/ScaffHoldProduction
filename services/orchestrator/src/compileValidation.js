const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function validateCompileRequest(request) {
  const errors = [];
  const required = ['campaignId', 'chainId', 'contractAddress', 'abi', 'walletProviders', 'approvedDomains'];
  const normalizedChainId =
    typeof request.chainId === 'string'
      ? (request.chainId.trim() === '' ? null : Number(request.chainId))
      : request.chainId;

  for (const field of required) {
    if (
      request[field] == null ||
      (typeof request[field] === 'string' && request[field].trim() === '') ||
      (Array.isArray(request[field]) && request[field].length === 0)
    ) {
      errors.push(`${field} is required`);
    }
  }

  if (normalizedChainId != null && (!Number.isInteger(normalizedChainId) || normalizedChainId <= 0)) {
    errors.push('chainId must be a positive integer');
  }

  if (request.contractAddress && !ADDRESS_REGEX.test(request.contractAddress)) {
    errors.push('contractAddress must be a valid EVM address');
  }

  if (request.abi && !Array.isArray(request.abi)) {
    errors.push('abi must be an array');
  }

  if (request.allowedMethods && request.allowedMethods.some((m) => !m || !m.signature || !m.executionType)) {
    errors.push('allowedMethods entries must include signature and executionType');
  }

  const script = request.integrationScript?.toLowerCase() ?? '';
  if (script.includes('private_key') || script.includes('secret')) {
    errors.push('integration script contains forbidden secret markers');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
