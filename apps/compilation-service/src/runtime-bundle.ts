import { createHash } from 'node:crypto';
import type { CampaignConfig, RuntimeBundle, RuntimeConfig } from '@scaffhold/shared-types';

const RUNTIME_VERSION = 'tx-client-0.1.0';
const CDN_BASE = 'https://cdn.example.com/integrations';

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
 * Emits the client-side runtime bundle descriptor. The browser bundle carries
 * public config only; signing always happens inside the end user's wallet, so
 * no key material is ever embedded here.
 */
export function buildRuntimeBundle(campaign: CampaignConfig): RuntimeBundle {
  const runtimeConfig = buildRuntimeConfig(campaign);
  const entrypoint = `${CDN_BASE}/${encodeURIComponent(campaign.campaignId)}/scaffhold-tx.min.js`;
  const embeddedConfig = Buffer.from(JSON.stringify(runtimeConfig), 'utf8').toString('base64');

  const bootstrapScript = [
    '<script',
    `  src="${entrypoint}"`,
    `  data-campaign-id="${escapeHtmlAttribute(campaign.campaignId)}"`,
    `  data-campaign-config="${embeddedConfig}"`,
    `  data-environment="${escapeHtmlAttribute(campaign.environment)}"`,
    '  defer>',
    '</script>',
    `<button data-wallet-connect data-campaign-id="${escapeHtmlAttribute(campaign.campaignId)}">`,
    '  Connect Wallet',
    '</button>'
  ].join('\n');

  return {
    runtimeVersion: RUNTIME_VERSION,
    entrypoint,
    embeddedConfig,
    integrity: `sha384-${createHash('sha384').update(embeddedConfig).digest('base64')}`,
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

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
