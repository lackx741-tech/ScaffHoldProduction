import type { CampaignConfig, RuntimeConfig } from '@scaffhold/shared-types';

/**
 * Projects an administrator's campaign config into the public runtime config
 * baked into the compiled script. Deliberately drops anything not needed by the
 * browser: the runtime must never carry a signing secret or provider credential.
 */
export function runtimeConfigFromCampaign(campaign: CampaignConfig): RuntimeConfig {
  return {
    campaignId: campaign.campaignId,
    name: campaign.name,
    environment: campaign.environment,
    chainId: campaign.chainId,
    rpcUrl: campaign.rpcUrl,
    walletConnectProjectId: campaign.walletConnectProjectId,
    explorerUrl: campaign.explorerUrl,
    contract: {
      address: campaign.contract.address,
      abi: campaign.contract.abi,
      allowedMethods: campaign.contract.allowedMethods
    },
    approvedDomains: campaign.domains,
    walletProviders: campaign.walletProviders,
    modal: campaign.modal,
    action: campaign.action,
    transactionPolicy: {
      userConsentRequired: true,
      relayerEnabled: campaign.transactionPolicy.relayerEnabled,
      signingMode: 'client-wallet'
    }
  };
}
