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

/**
 * The primary action a campaign button performs. Exposed to the compiled
 * runtime so an `.interact-button` can trigger a known allowlisted call.
 */
export const campaignActionSchema = z.object({
  label: z.string().min(1),
  methodSignature: z.string().min(1),
  args: z.array(z.unknown()).default([]),
  value: z.union([z.string(), z.number()]).optional()
});

export type CampaignAction = z.infer<typeof campaignActionSchema>;

export const campaignConfigSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1),
  environment: campaignEnvironmentSchema,
  chainId: z.number().int().positive(),
  /** Public JSON-RPC endpoint. Must never carry an authenticated provider secret. */
  rpcUrl: z.string().url().optional(),
  /** WalletConnect Cloud project id. Public client-side identifier. */
  walletConnectProjectId: z.string().min(1).optional(),
  explorerUrl: z.string().url().optional(),
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
  action: campaignActionSchema.optional(),
  transactionPolicy: z.object({
    userConsentRequired: z.literal(true),
    relayerEnabled: z.boolean(),
    signingMode: z.enum(['disabled', 'client-wallet'])
  })
});

export type CampaignConfig = z.infer<typeof campaignConfigSchema>;

export const compileCampaignRequestSchema = z.object({
  campaign: campaignConfigSchema
});

/**
 * Public configuration embedded into the compiled client runtime. It must never
 * carry signing secrets: the browser signs locally through the user's wallet.
 */
export const runtimeConfigSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1),
  environment: z.enum(['development', 'staging', 'production']),
  chainId: z.number().int().positive(),
  rpcUrl: z.string().url().optional(),
  walletConnectProjectId: z.string().min(1).optional(),
  explorerUrl: z.string().url().optional(),
  contract: z.object({
    address: evmAddressSchema,
    abi: z.array(contractAbiItemSchema).min(1),
    allowedMethods: z.array(z.string().min(1)).min(1)
  }),
  approvedDomains: z.array(z.string().min(1)).min(1),
  walletProviders: z.array(walletProviderSchema).min(1),
  modal: z.object({
    title: z.string().min(1),
    theme: z.enum(['light', 'dark', 'system'])
  }),
  action: campaignActionSchema.optional(),
  transactionPolicy: z.object({
    userConsentRequired: z.literal(true),
    relayerEnabled: z.boolean(),
    signingMode: z.literal('client-wallet')
  }),
  confirmationsRequired: z.number().int().nonnegative().optional()
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

/**
 * The standalone compiled deliverable: a single JavaScript file the customer
 * loads with `<script src="project-runtime.min.js" defer>`. It binds itself to
 * every `.interact-button` and needs no other integration code.
 */
export const projectRuntimeBundleSchema = z.object({
  fileName: z.string().min(1),
  runtimeVersion: z.string().min(1),
  /** Baked-in campaign config; the file is self-configuring. */
  config: runtimeConfigSchema,
  /** The complete standalone JavaScript source. */
  source: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  /** Content hash used for cache busting and the served file name. */
  contentHash: z.string().min(1),
  integrity: z.string().min(1),
  /** Stable panel-generated URL where the runtime is served and downloaded. */
  url: z.string().min(1)
});

export type ProjectRuntimeBundle = z.infer<typeof projectRuntimeBundleSchema>;

export const runtimeBundleSchema = z.object({
  runtimeVersion: z.string().min(1),
  /** How the runtime reaches the host page. */
  strategy: z.enum(['inline', 'external']),
  /** Base64-encoded runtime config injected into the host page. */
  embeddedConfig: z.string().min(1),
  /** SRI hash of the runtime source. */
  integrity: z.string().min(1),
  /** The packaged client runtime, inlined when strategy is "inline". */
  runtimeSource: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  /** Tag the customer pastes into their site head. */
  scriptTag: z.string().min(1),
  /** The `.interact-button` markup the runtime binds to. */
  buttonMarkup: z.string().min(1),
  bootstrapScript: z.string().min(1)
});

export type RuntimeBundle = z.infer<typeof runtimeBundleSchema>;

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
  notes: z.array(z.string()),
  runtime: runtimeBundleSchema.optional(),
  /** The standalone downloadable `project-runtime.min.js` deliverable. */
  projectRuntime: projectRuntimeBundleSchema.optional()
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
  'transaction.submitted',
  'transaction.confirmed',
  'transaction.failed',
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
