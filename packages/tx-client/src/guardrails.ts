import { encodeFunctionData, parseFunctionSignature } from './abi.js';
import { bytesToHex, hexToBytes } from './hex.js';
import { keccak256 } from './keccak.js';
import type { HexString, RuntimeCampaign, TransactionRequest } from './types.js';

export class GuardrailError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GuardrailError';
    this.code = code;
  }
}

const ALLOWED_CAMPAIGN_ENVIRONMENTS = ['development', 'staging', 'production'];

export function assertDomainAllowed(hostname: string, approvedDomains: string[]): void {
  if (!hostname) {
    throw new GuardrailError('missing_hostname', 'A hostname is required to authorize this runtime.');
  }
  const normalizedHost = hostname.toLowerCase();
  const allowed = approvedDomains.map((domain) => normalizeDomain(domain));

  if (!allowed.some((domain) => domainMatches(normalizedHost, domain))) {
    throw new GuardrailError(
      'domain_not_authorized',
      `Host "${hostname}" is not in the campaign allowlist.`
    );
  }
}

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

function domainMatches(host: string, allowed: string): boolean {
  return host === allowed || host.endsWith(`.${allowed}`);
}

export function isMethodAllowlisted(campaign: RuntimeCampaign, methodSignature: string): boolean {
  const allowed = campaign.contract.allowedMethods ?? [];
  const { name } = parseFunctionSignature(methodSignature);
  const canonical = canonicalizeSignature(methodSignature);
  return allowed.some((entry) => {
    const candidate = canonicalizeSignature(entry);
    return candidate === canonical || entry === methodSignature || entry === name;
  });
}

function canonicalizeSignature(signature: string): string {
  try {
    const { name, parameterTypes } = parseFunctionSignature(signature);
    return `${name}(${parameterTypes
      .map((type) => (type === 'uint' ? 'uint256' : type === 'int' ? 'int256' : type))
      .join(',')})`;
  } catch {
    return signature.trim();
  }
}

export function assertMethodAllowlisted(campaign: RuntimeCampaign, methodSignature: string): void {
  if (!isMethodAllowlisted(campaign, methodSignature)) {
    throw new GuardrailError(
      'method_not_allowlisted',
      `Method "${methodSignature}" is not allowlisted for campaign ${campaign.campaignId}.`
    );
  }
}

export function assertCampaignValid(campaign: RuntimeCampaign): void {
  if (!campaign.campaignId) {
    throw new GuardrailError('invalid_campaign', 'Campaign id is required.');
  }
  if (!ALLOWED_CAMPAIGN_ENVIRONMENTS.includes(campaign.environment)) {
    throw new GuardrailError('invalid_campaign', `Unknown environment "${campaign.environment}".`);
  }
  if (!Number.isInteger(campaign.chainId) || campaign.chainId <= 0) {
    throw new GuardrailError('invalid_campaign', 'A positive chain id is required.');
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(campaign.contract?.address ?? '')) {
    throw new GuardrailError('invalid_campaign', 'Contract address must be a 20-byte hex address.');
  }
  if (!Array.isArray(campaign.contract?.abi) || campaign.contract.abi.length === 0) {
    throw new GuardrailError('invalid_campaign', 'A non-empty contract ABI is required.');
  }
  if (!Array.isArray(campaign.contract?.allowedMethods) || campaign.contract.allowedMethods.length === 0) {
    throw new GuardrailError('invalid_campaign', 'At least one allowlisted method is required.');
  }
  if (!campaign.transactionPolicy?.userConsentRequired) {
    throw new GuardrailError('invalid_campaign', 'User consent must be required for this runtime.');
  }
  if (campaign.transactionPolicy?.signingMode !== 'client-wallet') {
    throw new GuardrailError(
      'invalid_campaign',
      'Client runtime requires signingMode "client-wallet" so keys never leave the wallet.'
    );
  }
}

export function assertAbiDeclaresMethod(campaign: RuntimeCampaign, methodSignature: string): void {
  const { name, parameterTypes } = parseFunctionSignature(methodSignature);
  const match = campaign.contract.abi.find((item) => {
    if (item.type !== 'function' || item.name !== name) {
      return false;
    }
    const inputs = (item.inputs ?? []).map((input) => canonicalizeType(input.type));
    return arraysEqual(inputs, parameterTypes.map(canonicalizeType));
  });

  if (!match) {
    throw new GuardrailError(
      'method_not_in_abi',
      `Method "${methodSignature}" is not declared in the campaign ABI.`
    );
  }
}

function canonicalizeType(type: string): string {
  if (type === 'uint') return 'uint256';
  if (type === 'int') return 'int256';
  return type;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function assertNoArbitraryCalldata(request: TransactionRequest): void {
  const candidate = request as TransactionRequest & { calldata?: unknown; data?: unknown };
  if (candidate.calldata !== undefined || candidate.data !== undefined) {
    throw new GuardrailError(
      'arbitrary_calldata_rejected',
      'Raw calldata cannot be supplied by the browser; it is derived from the allowlisted method and ABI.'
    );
  }
}

export function assertNoSecretMarkers(payload: unknown): void {
  const serialized = safeStringify(payload);
  const patterns = [
    /private[_-]?key/i,
    /relayer[_-]?(secret|key)/i,
    /mnemonic/i,
    /seed[_-]?phrase/i,
    /(postgres|mysql|mongodb|redis):\/\/[^\s"']*:[^\s"']*@/i,
    /aws(secret|access)[_-]?key/i,
    /\bBEGIN [A-Z ]*PRIVATE KEY\b/
  ];
  const hit = patterns.find((pattern) => pattern.test(serialized));
  if (hit) {
    throw new GuardrailError(
      'secret_material_detected',
      'The compiled runtime config must not contain private keys, credentials, or signing secrets.'
    );
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

export function assertProviderShape(provider: unknown): void {
  if (!provider || typeof (provider as { request?: unknown }).request !== 'function') {
    throw new GuardrailError(
      'invalid_provider',
      'An EIP-1193 provider with a request() method is required.'
    );
  }
}

export function buildCalldataHash(
  campaignId: string,
  chainId: number,
  to: string,
  methodSignature: string,
  args: unknown[],
  data: HexString
): HexString {
  const encoded = new TextEncoder().encode(
    JSON.stringify([campaignId, chainId, to.toLowerCase(), methodSignature, args, data])
  );
  return `0x${bytesToHex(keccak256(encoded))}`;
}

export function deriveCalldata(
  campaign: RuntimeCampaign,
  methodSignature: string,
  args: unknown[]
): HexString {
  const encoded = encodeFunctionData(methodSignature, args);
  const spec = campaign.contract.abi.find(
    (item) => item.name === parseFunctionSignature(methodSignature).name && item.type === 'function'
  );
  if (spec) {
    assertNoSecretMarkers(args);
  }
  return encoded as HexString;
}

export function normalizeHex(input: string): HexString {
  return (input.startsWith('0x') ? input.toLowerCase() : `0x${input.toLowerCase()}`) as HexString;
}

export function hexByteLength(input: string): number {
  return hexToBytes(input).length;
}
