import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CampaignConfig, RuntimeBundle, RuntimeConfig } from '@scaffhold/shared-types';

const RUNTIME_VERSION = 'tx-client-0.1.0';
const RUNTIME_BUNDLE_RELATIVE = 'packages/tx-client/dist/scaffhold-tx.min.js';

export function buildRuntimeConfig(campaign: CampaignConfig): RuntimeConfig {
  return {
    campaignId: campaign.campaignId,
    name: campaign.name,
    environment: campaign.environment,
    chainId: campaign.chainId,
    contract: {
      address: campaign.contract.address,
      abi: campaign.contract.abi,
      allowedMethods: campaign.contract.allowedMethods
    },
    approvedDomains: campaign.domains,
    walletProviders: campaign.walletProviders,
    transactionPolicy: {
      userConsentRequired: true,
      relayerEnabled: campaign.transactionPolicy.relayerEnabled,
      signingMode: 'client-wallet'
    },
    confirmationsRequired: campaign.transactionPolicy.relayerEnabled ? 2 : 1
  };
}

/**
 * Locates the built browser runtime. Resolved by walking up from the service's
 * own directory (CommonJS build) and from the working directory (ESM hosts such
 * as the test runner), so it works regardless of how the service is launched.
 */
export function loadRuntimeSource(): string {
  const starts: string[] = [];
  try {
    starts.push(__dirname);
  } catch {
    // ESM host: __dirname is not defined.
  }
  starts.push(process.cwd());

  for (const start of starts) {
    let dir = start;
    for (let depth = 0; depth < 8; depth += 1) {
      const candidate = join(dir, RUNTIME_BUNDLE_RELATIVE);
      if (existsSync(candidate)) {
        return readFileSync(candidate, 'utf8');
      }
      const parent = dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }

  throw new Error(
    `Unable to locate the built client runtime at "${RUNTIME_BUNDLE_RELATIVE}". Run "pnpm --filter @scaffhold/tx-client build" before compiling campaigns.`
  );
}

/**
 * Emits the self-contained runtime descriptor. The browser runtime is inlined
 * directly into the compiled output alongside the encoded public config and the
 * wallet connect button, so the artifact needs no external script host. Signing
 * always happens inside the end user's wallet; no key material is embedded.
 */
export function buildRuntimeBundle(campaign: CampaignConfig): RuntimeBundle {
  const runtimeConfig = buildRuntimeConfig(campaign);
  const embeddedConfig = Buffer.from(JSON.stringify(runtimeConfig), 'utf8').toString('base64');
  const runtimeSource = loadRuntimeSource();
  const integrity = `sha384-${createHash('sha384').update(runtimeSource).digest('base64')}`;

  const bootstrapScript = [
    '<script>',
    `window.SCAFFHOLD_RUNTIME_CONFIG=${JSON.stringify(embeddedConfig)};`,
    '</script>',
    '<script>',
    `/* ${RUNTIME_VERSION} (inlined) */`,
    escapeInlineScript(runtimeSource),
    '</script>',
    `<button data-wallet-connect data-campaign-id="${escapeHtmlAttribute(campaign.campaignId)}">`,
    '  Connect Wallet',
    '</button>'
  ].join('\n');

  return {
    runtimeVersion: RUNTIME_VERSION,
    strategy: 'inline',
    embeddedConfig,
    integrity,
    runtimeSource,
    sizeBytes: Buffer.byteLength(runtimeSource, 'utf8'),
    bootstrapScript
  };
}

/**
 * Compile-time check that every allowlisted method is declared in the ABI with a
 * matching argument list, so a misconfigured campaign fails before it is served.
 */
export function validateRuntimeMethods(campaign: CampaignConfig): string[] {
  const issues: string[] = [];

  for (const signature of campaign.contract.allowedMethods) {
    const parsed = parseSignature(signature);
    if (!parsed) {
      issues.push(`Allowlisted method "${signature}" is malformed.`);
      continue;
    }

    const declared = campaign.contract.abi.find(
      (item) => item.type === 'function' && item.name === parsed.name
    );
    if (!declared) {
      issues.push(`Allowlisted method "${signature}" is not declared in the contract ABI.`);
      continue;
    }

    const abiTypes = (declared.inputs ?? []).map((input) => canonicalType(input.type));
    if (abiTypes.length !== parsed.parameterTypes.length) {
      issues.push(
        `Allowlisted method "${signature}" expects ${parsed.parameterTypes.length} argument(s) but the ABI declares ${abiTypes.length}.`
      );
      continue;
    }

    const mismatch = parsed.parameterTypes.some((type, index) => abiTypes[index] !== canonicalType(type));
    if (mismatch) {
      issues.push(`Allowlisted method "${signature}" parameter types do not match the ABI.`);
    }
  }

  return issues;
}

const SUPPORTED_TYPES = /^(u?int\d*|address|bool|bytes\d*|string)$/;

function parseSignature(signature: string): { name: string; parameterTypes: string[] } | undefined {
  const match = /^([A-Za-z_$][A-Za-z0-9_$]*)\((.*)\)$/.exec(signature.trim());
  if (!match) {
    return undefined;
  }
  const rawParams = match[2]!.trim();
  const parameterTypes = rawParams.length === 0 ? [] : rawParams.split(',').map((part) => part.trim());
  for (const type of parameterTypes) {
    if (!SUPPORTED_TYPES.test(type)) {
      return undefined;
    }
  }
  return { name: match[1]!, parameterTypes };
}

function canonicalType(type: string): string {
  if (type === 'uint') return 'uint256';
  if (type === 'int') return 'int256';
  return type;
}

/** Prevents an inlined bundle from breaking out of its script element. */
function escapeInlineScript(source: string): string {
  return source.replaceAll('</script', '<\\/script');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
