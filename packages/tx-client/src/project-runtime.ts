import { decodeAbiParameters, encodeFunctionData } from './abi.js';
import { TransactionEngine } from './engine.js';
import { shortenAddress } from './format.js';
import {
  GuardrailError,
  assertAbiDeclaresMethod,
  assertNoSecretMarkers,
  isMethodAllowlisted
} from './guardrails.js';
import type {
  ConnectResult,
  Eip1193Provider,
  HexString,
  RuntimeAbiItem,
  RuntimeCampaign,
  TransactionRuntimeEvent,
  TransactionRuntimeOptions
} from './types.js';
import { preferredProviderKind, resolveProvider, type ProviderKind } from './walletconnect.js';

export interface ProjectRuntimeOptions {
  campaign: RuntimeCampaign;
  /** Selector or element list to bind. Defaults to every `.interact-button`. */
  triggerSelector?: string;
  /** Overrides provider selection; otherwise derived from the campaign config. */
  providerKind?: ProviderKind;
  /** Pre-supplied EIP-1193 provider. Skips WalletConnect/injected resolution. */
  provider?: Eip1193Provider;
  hostname?: string;
  requestApproval?: TransactionRuntimeOptions['requestApproval'];
  now?: () => Date;
}

export interface ProjectReadCall {
  methodSignature: string;
  args?: unknown[];
  /** Decoded by the ABI when omitted. */
  outputs?: string[];
}

export interface ProjectWriteCall {
  methodSignature: string;
  args?: unknown[];
  value?: string | number;
}

type Listener = (event: { type: string; payload: Record<string, unknown> }) => void;

/**
 * The public surface exposed as `window.ProjectRuntime` by the compiled script.
 * Attaches to `.interact-button` triggers, opens the configured wallet provider,
 * emits wallet/chain/transaction events, and supports read/write calls once
 * connected. It never holds a signing key: every write is signed by the wallet.
 */
export class ProjectRuntime {
  readonly campaign: RuntimeCampaign;
  private readonly options: ProjectRuntimeOptions;
  private readonly listeners = new Set<Listener>();
  private readonly boundButtons = new WeakSet<Element>();

  private provider?: Eip1193Provider;
  private engine?: TransactionEngine;
  private address?: HexString;
  private chainId?: number;
  private observer?: MutationObserver;

  constructor(options: ProjectRuntimeOptions) {
    assertNoSecretMarkers(options.campaign);
    this.options = options;
    this.campaign = options.campaign;
    this.providerKind = options.providerKind ?? preferredProviderKind(
      options.campaign.walletProviders,
      Boolean(options.campaign.walletConnectProjectId)
    );
  }

  readonly providerKind: ProviderKind;

  // ---- events -------------------------------------------------------------

  /** Subscribes to wallet, chain, and transaction events. Returns an unsubscribe. */
  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(type: string, payload: Record<string, unknown>): void {
    for (const listener of this.listeners) {
      try {
        listener({ type, payload });
      } catch (error) {
        console.error('[project-runtime] listener failed', error);
      }
    }
  }

  // ---- DOM binding --------------------------------------------------------

  /**
   * Finds every `.interact-button` (or the configured selector) and wires it to
   * the wallet connect flow. Re-scans on DOM mutations so buttons rendered by
   * the host site after load are still bound.
   */
  bind(selector = this.options.triggerSelector ?? '.interact-button'): number {
    if (typeof document === 'undefined') {
      return 0;
    }

    const buttons = document.querySelectorAll<HTMLButtonElement>(selector);
    let bound = 0;
    buttons.forEach((button) => {
      if (this.boundButtons.has(button)) {
        return;
      }
      this.boundButtons.add(button);
      button.addEventListener('click', () => {
        void this.connect().catch((error) => {
          this.emit('runtime.error', { message: errorMessage(error) });
        });
      });
      bound += 1;
      this.decorate(button);
    });

    if (!this.observer && typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(() => {
        this.bind(selector);
      });
      this.observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    return bound;
  }

  /** Applies the configured label/theme to a trigger button. */
  private decorate(button: HTMLButtonElement): void {
    const label = this.campaign.action?.label ?? button.textContent?.trim() ?? '';
    if (!button.textContent?.trim() && label) {
      button.textContent = label;
    }
    button.classList.add('interact-button');
    button.dataset.campaignId = this.campaign.campaignId;
    const theme = this.campaign.modal.theme;
    if (theme === 'dark') {
      button.style.colorScheme = 'dark';
    } else if (theme === 'light') {
      button.style.colorScheme = 'light';
    }
  }

  // ---- connection ---------------------------------------------------------

  /** Resolves the provider, opens WalletConnect if configured, and connects. */
  async connect(): Promise<ConnectResult> {
    const engine = await this.ensureEngine();
    const result = await engine.connect();
    this.address = result.address;
    this.chainId = result.chainId;
    this.emit('wallet.connected', { address: result.address, chainId: result.chainId });
    return result;
  }

  /** Tears down the session and notifies listeners. */
  async disconnect(): Promise<void> {
    const provider = this.provider as (Eip1193Provider & { disconnect?: () => Promise<void> }) | undefined;
    await provider?.disconnect?.();
    this.emit('wallet.disconnected', { address: this.address });
    this.address = undefined;
    this.engine = undefined;
  }

  /** Currently connected account, if any. */
  get connectedAddress(): HexString | undefined {
    return this.address;
  }

  get shortAddress(): string | undefined {
    return this.address ? shortenAddress(this.address) : undefined;
  }

  get connectedChainId(): number | undefined {
    return this.chainId;
  }

  private async ensureEngine(): Promise<TransactionEngine> {
    if (this.engine) {
      return this.engine;
    }

    const provider =
      this.options.provider ??
      (await resolveProvider(this.providerKind, {
        projectId: this.campaign.walletConnectProjectId ?? '',
        chainId: this.campaign.chainId,
        rpcUrl: this.campaign.rpcUrl,
        dappName: this.campaign.name,
        dappUrl: typeof location !== 'undefined' ? location.origin : undefined,
        theme: this.campaign.modal.theme === 'light' ? 'light' : 'dark'
      }));

    this.provider = provider;
    this.watchProvider(provider);

    const engineOptions: TransactionRuntimeOptions = {
      campaign: this.campaign,
      provider,
      hostname: this.options.hostname,
      now: this.options.now,
      requestApproval: this.options.requestApproval,
      onEvent: (event: TransactionRuntimeEvent) => {
        this.emit(event.type, event.payload);
      }
    };
    // Bind wallet/chain events through the engine's own subscription surface.
    provider.on?.('accountsChanged', ((accounts: unknown) => {
      const list = Array.isArray(accounts) ? accounts : [];
      this.emit('wallet.accountsChanged', { accounts: list });
      if (list.length === 0) {
        this.address = undefined;
        this.emit('wallet.disconnected', {});
      }
    }) as (...args: unknown[]) => void);
    provider.on?.('chainChanged', ((chainIdHex: unknown) => {
      const chainId = Number.parseInt(String(chainIdHex), 16);
      this.chainId = chainId;
      this.emit('chain.changed', { chainId });
    }) as (...args: unknown[]) => void);

    this.engine = new TransactionEngine(engineOptions);
    return this.engine;
  }

  private watchProvider(provider: Eip1193Provider): void {
    provider.on?.('disconnect', (() => {
      this.emit('wallet.disconnected', {});
      this.address = undefined;
    }) as (...args: unknown[]) => void);
  }

  // ---- contract calls -----------------------------------------------------

  /** Read-only `eth_call`. Allowlisted methods only; never signs. */
  async read(call: ProjectReadCall): Promise<unknown[]> {
    await this.ensureEngine();
    assertReadable(this.campaign, call.methodSignature);
    const provider = this.provider!;
    const outputs = call.outputs ?? resolveOutputs(this.campaign, call.methodSignature);
    const data = encodeFunctionData(call.methodSignature, call.args ?? []);

    const raw = (await provider.request({
      method: 'eth_call',
      params: [
        { to: this.campaign.contract.address, data },
        'latest'
      ]
    })) as string;

    const decoded = outputs.length > 0 ? decodeAbiParameters(outputs, raw) : [];
    this.emit('contract.read', { methodSignature: call.methodSignature, outputs: decoded });
    return decoded;
  }

  /** Write call: prepare, simulate, await explicit approval, then wallet-submit. */
  async write(call: ProjectWriteCall) {
    const engine = await this.ensureEngine();
    assertWritable(this.campaign, call.methodSignature);

    const prepared = await engine.prepare({
      methodSignature: call.methodSignature,
      args: call.args ?? [],
      value: call.value
    });

    const approved = await engine.approve(prepared);
    if (!approved) {
      this.emit('transaction.cancelled', { idempotencyKey: prepared.intent.idempotencyKey });
      return { status: 'USER_CANCELLED' as const };
    }

    const sent = await engine.send(prepared);
    const confirmation = await engine.waitForConfirmation(sent.id);
    this.emit('transaction.confirmed', {
      txHash: confirmation.txHash,
      blockNumber: confirmation.blockNumber
    });
    return confirmation;
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.listeners.clear();
  }
}

function assertReadable(campaign: RuntimeCampaign, methodSignature: string): void {
  assertAbiDeclaresMethod(campaign, methodSignature);
}

function assertWritable(campaign: RuntimeCampaign, methodSignature: string): void {
  if (!isMethodAllowlisted(campaign, methodSignature)) {
    throw new GuardrailError(
      'method_not_allowlisted',
      `Method "${methodSignature}" is not allowlisted for campaign ${campaign.campaignId}.`
    );
  }
  assertAbiDeclaresMethod(campaign, methodSignature);
}

function resolveOutputs(campaign: RuntimeCampaign, methodSignature: string): string[] {
  const name = methodSignature.split('(')[0];
  const item: RuntimeAbiItem | undefined = campaign.contract.abi.find(
    (entry) => entry.type === 'function' && entry.name === name
  );
  return (item?.outputs ?? []).map((output) => output.type);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
