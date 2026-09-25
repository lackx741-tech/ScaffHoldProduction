const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function validateCompileRequest(request) {
  const errors = [];
  const required = ['campaignId', 'chainId', 'contractAddress', 'abi', 'walletProviders', 'approvedDomains'];

  for (const field of required) {
    if (request[field] == null || (Array.isArray(request[field]) && request[field].length === 0)) {
      errors.push(`${field} is required`);
    }
  }

  if (request.chainId != null && (!Number.isInteger(request.chainId) || request.chainId <= 0)) {
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

  if (request.integrationScript?.includes('PRIVATE_KEY') || request.integrationScript?.includes('SECRET')) {
    errors.push('integration script contains forbidden secret markers');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
