import { z } from 'zod';

export const campaignEnvironmentSchema = z.enum(['development', 'staging', 'production']);
export const walletProviderSchema = z.enum(['reown', 'walletconnect-v2', 'rainbowkit', 'injected']);
export const evmAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Expected a 20-byte EVM address.');

export const contractAbiItemSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  inputs: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.string().min(1)
      })
    )
    .default([])
});

export const campaignConfigSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1),
  environment: campaignEnvironmentSchema,
  chainId: z.number().int().positive(),
  contract: z.object({
    address: evmAddressSchema,
    abi: z.array(contractAbiItemSchema).min(1),
    allowedMethods: z.array(z.string().min(1)).min(1)
  }),
  domains: z.array(z.string().min(1)).min(1),
  walletProviders: z.array(walletProviderSchema).min(1),
  modal: z.object({
    title: z.string().min(1),
    theme: z.enum(['light', 'dark', 'system'])
  }),
  transactionPolicy: z.object({
    userConsentRequired: z.literal(true),
    relayerEnabled: z.boolean(),
    signingMode: z.literal('disabled')
  })
});

export type CampaignConfig = z.infer<typeof campaignConfigSchema>;

export const compileCampaignRequestSchema = z.object({
  campaign: campaignConfigSchema
});

export const integrationArtifactSchema = z.object({
  campaignId: z.string(),
  version: z.string(),
  bundleHash: z.string(),
  publicKey: z.string(),
  generatedAt: z.string(),
  approvedDomains: z.array(z.string()),
  supportedChains: z.array(z.number().int().positive()),
  walletProviders: z.array(walletProviderSchema),
  files: z.array(
    z.object({
      path: z.string(),
      description: z.string()
    })
  ),
  inlineScript: z.string(),
  notes: z.array(z.string())
});

export type IntegrationArtifact = z.infer<typeof integrationArtifactSchema>;

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'ready']),
  service: z.string(),
  timestamp: z.string(),
  dependencies: z
    .object({
      postgres: z.string(),
      redis: z.string()
    })
    .optional()
});

export const platformEventTypeSchema = z.enum([
  'campaign.compilation.requested',
  'campaign.compilation.completed',
  'campaign.compilation.failed',
  'domain.verification.requested',
  'domain.verified',
  'wallet.connected',
  'wallet.disconnected',
  'transaction.requested',
  'transaction.simulated',
  'transaction.status.updated',
  'transaction.rejected'
]);

export type PlatformEventType = z.infer<typeof platformEventTypeSchema>;

export const platformEventSchema = z.object({
  id: z.string().min(1),
  type: platformEventTypeSchema,
  version: z.literal(1),
  timestamp: z.string().min(1),
  source: z.string().min(1),
  correlationId: z.string().min(1),
  campaignId: z.string().optional(),
  userId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  retryCount: z.number().int().nonnegative()
});

export type PlatformEvent = z.infer<typeof platformEventSchema>;

export const transactionPreparationRequestSchema = z.object({
  campaignId: z.string().min(1),
  chainId: z.number().int().positive(),
  contractAddress: evmAddressSchema,
  methodSignature: z.string().min(1),
  allowlisted: z.boolean(),
  userConsentConfirmed: z.boolean(),
  idempotencyKey: z.string().min(1),
  calldata: z.string().optional()
});

export type TransactionPreparationRequest = z.infer<typeof transactionPreparationRequestSchema>;

export const transactionStatusSchema = z.enum([
  'REQUESTED',
  'VALIDATED',
  'SIMULATED',
  'REJECTED',
  'DISABLED'
]);
