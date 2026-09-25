import { createHash } from 'node:crypto';
import * as sharedTypes from '@scaffhold/shared-types';
import type { CampaignConfig, IntegrationArtifact } from '@scaffhold/shared-types';

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

export function buildPlaceholderArtifact(campaign: CampaignConfig): IntegrationArtifact {
  const serialized = stableStringify(campaign);
  const bundleHash = createHash('sha256').update(serialized).digest('hex');
  const version = `v1-${bundleHash.slice(0, 8)}`;

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
      { path: 'dist/integration.js', description: 'Placeholder hosted bundle entrypoint.' },
      { path: 'dist/integration.min.js', description: 'Placeholder production bundle entrypoint.' },
      { path: 'dist/integration.css', description: 'Placeholder presentation layer styles.' },
      { path: 'dist/manifest.json', description: 'Versioned public integration manifest.' },
      { path: 'dist/integrity.json', description: 'Future SRI and content hash metadata.' },
      { path: 'dist/README.md', description: 'Installation instructions for the compiled artifact.' }
    ],
    inlineScript: `<script data-campaign-id="${campaign.campaignId}" data-version="${version}" src="https://cdn.example.com/integrations/${campaign.campaignId}/integration.min.js" defer></script>`,
    notes: [
      'Scaffold output only: no hosted bundle is produced yet.',
      'Signing and broadcasting stay disabled until production hardening is complete.'
    ]
  };
}

export function validateCompileRequest(payload: unknown) {
  return sharedTypes.compileCampaignRequestSchema.safeParse(payload);
}
