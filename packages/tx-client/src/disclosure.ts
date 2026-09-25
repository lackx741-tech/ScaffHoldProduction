import { formatEther } from './format.js';
import type { RuntimeCampaign, TransactionIntent } from './types.js';

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  5: 'Goerli',
  10: 'OP Mainnet',
  56: 'BNB Smart Chain',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum One',
  11155111: 'Sepolia'
};

export function chainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}

const METHOD_DESCRIPTIONS: Record<string, string> = {
  mint: 'Mint',
  transfer: 'Transfer',
  approve: 'Approve spending',
  safeTransferFrom: 'Transfer token',
  claim: 'Claim',
  stake: 'Stake',
  unstake: 'Unstake'
};

/**
 * Builds the human-readable disclosure the spec requires before approval:
 * target contract, network, transaction type, estimated gas, and assets/permissions.
 */
export function buildDisclosure(campaign: RuntimeCampaign, intent: Omit<TransactionIntent, 'disclosure' | 'assetEffects'>): {
  disclosure: string[];
  assetEffects: string[];
} {
  const methodName = intent.methodSignature.split('(')[0] ?? intent.methodSignature;
  const action = METHOD_DESCRIPTIONS[methodName] ?? methodName;
  const displayMethod = intent.methodSignature.replace(/uint256/, 'uint');

  const disclosure = [
    `Network: ${chainName(intent.chainId)} (chain ID ${intent.chainId}).`,
    `Contract: ${intent.to}.`,
    `Transaction type: ${action} via ${displayMethod}.`,
    `Arguments: ${formatArgs(intent.args)}.`,
    `Value sent: ${formatEther(intent.valueWei)} ETH.`,
    `Estimated gas: ${intent.gasEstimate.toString()} units.`
  ];

  const assetEffects: string[] = [];
  if (intent.valueWei > 0n) {
    assetEffects.push(`${formatEther(intent.valueWei)} ETH will leave your wallet.`);
  }
  switch (methodName) {
    case 'approve':
      assetEffects.push('This grants a token allowance to the campaign contract.');
      break;
    case 'mint':
      assetEffects.push('Minting may transfer funds or tokens from your wallet.');
      break;
    case 'transfer':
    case 'safeTransferFrom':
      assetEffects.push('A token or asset balance will be transferred.');
      break;
    default:
      assetEffects.push('Confirm the contract and method match the campaign you expect.');
  }

  if (campaign.transactionPolicy.relayerEnabled) {
    disclosure.push('A relayer is configured; submission may be gas-sponsored by the platform.');
  }

  return { disclosure, assetEffects };
}

export function formatArgs(args: unknown[]): string {
  if (args.length === 0) {
    return 'none';
  }
  return args
    .map((arg) => {
      if (typeof arg === 'bigint') {
        return arg.toString();
      }
      if (typeof arg === 'string' && arg.length > 42) {
        return `${arg.slice(0, 10)}…${arg.slice(-8)}`;
      }
      return String(arg);
    })
    .join(', ');
}
