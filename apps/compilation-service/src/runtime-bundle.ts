import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type {
  CampaignConfig,
  ProjectRuntimeBundle,
  RuntimeBundle,
  RuntimeConfig
} from '@scaffhold/shared-types';
import { runtimeConfigFromCampaign } from './config.js';

// Validation is reimplemented here rather than imported from @scaffhold/tx-client:
// this service is CommonJS and the runtime package is browser ESM, so the two
// cannot share modules. The shared-types schema is the common contract.

const RUNTIME_FILE_NAME = 'project-runtime.min.js';
const RUNTIME_RELATIVE_PATH = join('packages', 'tx-client', 'dist', 'scaffhold-tx.min.js');

/**
 * Locates the built browser runtime. Walks up from this module and the working
 * directory so it resolves under both the compiled server and the ESM test
 * runner.
 */
export function loadRuntimeSource(): string {
  const candidates: string[] = [];
  let current = __dirname;
  for (let depth = 0; depth < 6; depth += 1) {
    candidates.push(resolve(current, RUNTIME_RELATIVE_PATH));
    current = dirname(current);
  }
  candidates.push(resolve(process.cwd(), RUNTIME_RELATIVE_PATH));
  candidates.push(resolve(process.cwd(), '..', RUNTIME_RELATIVE_PATH));
  candidates.push(resolve(process.cwd(), '..', '..', RUNTIME_RELATIVE_PATH));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, 'utf8');
    }
  }

  throw new Error(
    `Compiled runtime not found. Run "pnpm --filter @scaffhold/tx-client build" before compiling a campaign. Looked in: ${candidates.join(', ')}`
  );
}

/** Serializes config for embedding, neutralising any `</script` terminator. */
function serializeConfig(config: RuntimeConfig): string {
  return JSON.stringify(config).replaceAll('</script', '<\\/script');
}

/**
 * Produces the standalone per-campaign deliverable: a single self-contained
 * JavaScript file that bakes in chain, RPC, contract, ABI, theme, and the
 * configured action. The customer loads it with a script tag; every
 * `.interact-button` on the page becomes a trigger. No dashboard code ships.
 */
export function buildProjectRuntime(
  campaign: CampaignConfig,
  options: { baseUrl?: string } = {}
): ProjectRuntimeBundle {
  const config = runtimeConfigFromCampaign(campaign);
  const baseSource = loadRuntimeSource();

  // The runtime auto-boots on load and reads this global, so the config must be
  // assigned before the bundle body executes.
  const source = `window.SCAFFHOLD_RUNTIME_CONFIG=${serializeConfig(config)};\n${baseSource}`;

  const contentHash = createHash('sha256').update(source).digest('hex').slice(0, 16);
  const integrity = `sha384-${createHash('sha384').update(source).digest('base64')}`;
  const fileName = `${campaign.campaignId}.${contentHash}.${RUNTIME_FILE_NAME}`;

  const baseUrl = (options.baseUrl ?? '/compilation/v1/runtime').replace(/\/+$/, '');

  return {
    fileName,
    runtimeVersion: `v1-${contentHash.slice(0, 8)}`,
    config,
    source,
    sizeBytes: Buffer.byteLength(source, 'utf8'),
    contentHash,
    integrity,
    url: `${baseUrl}/${campaign.campaignId}/${contentHash}/${RUNTIME_FILE_NAME}`
  };
}

/** The `<script>` tag and `.interact-button` markup the customer pastes in. */
export function buildCustomerSnippet(projectRuntime: ProjectRuntimeBundle): {
  scriptTag: string;
  buttonMarkup: string;
} {
  const scriptTag = `<script src="${projectRuntime.url}" defer></script>`;
  const buttonMarkup = '<button class="interact-button">Connect Wallet</button>';
  return { scriptTag, buttonMarkup };
}

/**
 * Minimal test harness page. This is only a preview aid for the dashboard; the
 * shipped deliverable is the standalone JavaScript file itself.
 */
export function buildHarnessPage(
  campaign: CampaignConfig,
  projectRuntime: ProjectRuntimeBundle,
  snippet: { scriptTag: string; buttonMarkup: string }
): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(campaign.name)} — integration harness</title>`,
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    snippet.scriptTag,
    '</head>',
    '<body>',
    `<h1>${escapeHtml(campaign.name)}</h1>`,
    snippet.buttonMarkup,
    '</body>',
    '</html>'
  ].join('\n');
}

/**
 * Builds the runtime descriptor carried on the compilation artifact. The
 * primary deliverable is the standalone file (`projectRuntime`); `scriptTag`
 * and `buttonMarkup` are the entire integration contract.
 */
export function buildRuntimeBundle(
  campaign: CampaignConfig,
  options: { baseUrl?: string } = {}
): { runtime: RuntimeBundle; projectRuntime: ProjectRuntimeBundle } {
  const projectRuntime = buildProjectRuntime(campaign, options);
  const snippet = buildCustomerSnippet(projectRuntime);
  const config = projectRuntime.config;

  const runtime: RuntimeBundle = {
    runtimeVersion: projectRuntime.runtimeVersion,
    strategy: 'external',
    embeddedConfig: Buffer.from(JSON.stringify(config), 'utf8').toString('base64'),
    integrity: projectRuntime.integrity,
    runtimeSource: projectRuntime.source,
    sizeBytes: projectRuntime.sizeBytes,
    scriptTag: snippet.scriptTag,
    buttonMarkup: snippet.buttonMarkup,
    bootstrapScript: buildHarnessPage(campaign, projectRuntime, snippet)
  };

  return { runtime, projectRuntime };
}

/**
 * Rejects campaigns whose allowlisted methods are missing from the ABI or whose
 * argument lists do not match the declared inputs. Mirrors the runtime guardrail
 * so invalid campaigns fail at compile time rather than in the browser.
 */
export function validateRuntimeMethods(campaign: CampaignConfig): string[] {
  const issues: string[] = [];
  const { abi } = campaign.contract;

  for (const method of campaign.contract.allowedMethods) {
    if (!abiDeclares(abi, method)) {
      issues.push(`Method "${method}" is not declared in the campaign ABI.`);
    }
  }

  if (campaign.action && !campaign.contract.allowedMethods.includes(campaign.action.methodSignature)) {
    issues.push(
      `Campaign action "${campaign.action.methodSignature}" must be one of the allowlisted methods.`
    );
  }

  return issues;
}

function abiDeclares(abi: CampaignConfig['contract']['abi'], methodSignature: string): boolean {
  const parsed = parseSignature(methodSignature);
  if (!parsed) {
    return false;
  }
  const { name, parameterTypes } = parsed;

  return abi.some((item) => {
    if (item.type !== 'function' || item.name !== name) {
      return false;
    }
    const inputs = (item.inputs ?? []).map((input) => canonicalize(input.type));
    return inputs.length === parameterTypes.length &&
      inputs.every((type, index) => type === canonicalize(parameterTypes[index]!));
  });
}

function parseSignature(signature: string): { name: string; parameterTypes: string[] } | undefined {
  const match = /^([A-Za-z_$][A-Za-z0-9_$]*)\((.*)\)$/.exec(signature.trim());
  if (!match) {
    return undefined;
  }
  const rawParams = match[2]!.trim();
  return {
    name: match[1]!,
    parameterTypes: rawParams.length === 0 ? [] : rawParams.split(',').map((part) => part.trim())
  };
}

function canonicalize(type: string): string {
  if (type === 'uint') return 'uint256';
  if (type === 'int') return 'int256';
  return type;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
