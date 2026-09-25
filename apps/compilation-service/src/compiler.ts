import { createHash } from 'node:crypto';
import * as sharedTypes from '@scaffhold/shared-types';
import type { CampaignConfig, IntegrationArtifact } from '@scaffhold/shared-types';
import { buildRuntimeBundle } from './runtime-bundle.js';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function buildPlaceholderArtifact(
  campaign: CampaignConfig,
  options: { baseUrl?: string } = {}
): IntegrationArtifact {
  const serialized = stableStringify(campaign);
  const bundleHash = createHash('sha256').update(serialized).digest('hex');
  const version = `v1-${bundleHash.slice(0, 8)}`;
  const { runtime, projectRuntime } = buildRuntimeBundle(campaign, options);

  return {
    campaignId: campaign.campaignId,
    version,
    bundleHash,
    publicKey: `pub_${bundleHash.slice(0, 16)}`,
    generatedAt: 'scaffold-deterministic',
    approvedDomains: campaign.domains,
    supportedChains: [campaign.chainId],
    walletProviders: campaign.walletProviders,
    files: [
      {
        path: projectRuntime.fileName,
        description: 'Standalone runtime. Add with a script tag; binds every .interact-button.'
      },
      { path: 'dist/manifest.json', description: 'Versioned public integration manifest.' },
      { path: 'dist/integrity.json', description: 'SRI and content hash metadata.' }
    ],
    inlineScript: runtime.scriptTag,
    runtime,
    projectRuntime,
    notes: [
      'The deliverable is a standalone JavaScript file. Load it with a script tag; no dashboard code is required.',
      'Every element with the .interact-button class becomes a wallet-connect trigger automatically.',
      'The runtime signs exclusively through the end user wallet; no key material is embedded.'
    ]
  };
}

export function validateCompileRequest(payload: unknown) {
  return sharedTypes.compileCampaignRequestSchema.safeParse(payload);
}
