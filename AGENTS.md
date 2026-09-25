# Repository Guide

pnpm monorepo for a distributed Web3 campaign compilation platform. TypeScript throughout, Vitest for tests, ESLint flat config.

## Layout

- `apps/` — `admin-dashboard` (React+Vite), `orchestrator-api`, `scanner-service`, `transaction-engine`, `compilation-service` (Express)
- `packages/` — `shared-types` (zod schemas), `config` (ports/URLs/redis keys), `tx-client` (client-side browser runtime)
- `tests/` — root Vitest suite exercising packages and apps together

## Commands

Run from the repo root. `pnpm@12.6.0` is the pinned package manager.

```bash
pnpm build:packages   # builds shared-types, config, tx-client (run before tests/typecheck)
pnpm lint             # eslint across every package, app, and tests/
pnpm typecheck        # tsc --noEmit for every workspace
pnpm test             # build:packages, then vitest run
pnpm build            # build packages and all apps
pnpm dev              # dashboard + all services via concurrently
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build. Keep all four green.

## Conventions

- Packages compile to CommonJS `dist/` via `tsc`; **source files import with `.js` extensions** (`./foo.js`) for Node16 resolution. The built `dist/` is gitignored repo-wide.
- Adding a workspace package means wiring it into the root `build`, `build:packages`, `lint`, and `typecheck` scripts — CI only calls the root scripts.
- Each app/package has its own `package.json` with `build`/`lint`/`typecheck` scripts; keep that shape when adding one.
- Tests live in `tests/` at the root and import source directly (not `dist/`).

## Client transaction runtime (`packages/tx-client`)

This is the transaction engine shipped inside compiled campaign integrations. It runs in the end user's browser and must follow exactly:

```text
wallet connect -> prepare -> simulate -> explicit user approval -> wallet-submitted tx -> status
```

Non-negotiable guardrails — do not weaken these:

- **No keys, ever.** No private keys, mnemonics, or relayer secrets in the runtime or in compiled output. `assertNoSecretMarkers` scans config; the compilation service embeds public config only.
- **Domain allowlist.** Constructing `TransactionEngine` on a hostname outside `campaign.approvedDomains` throws before any wallet call. Matching is exact or subdomain-suffix only.
- **Method allowlist + ABI-derived calldata.** `assertNoArbitraryCalldata` rejects any request carrying `calldata`/`data`. Calldata is always derived from the allowlisted signature plus the campaign ABI.
- **Simulate before approval.** `eth_call` runs first; a revert aborts the flow without requesting a signature.
- **Explicit consent.** Submission happens only after `requestApproval` resolves `true`. Rejection is recorded as `USER_CANCELLED` with no wallet submission.
- **Idempotency.** `deriveIdempotencyKey` hashes campaign/chain/from/to/method/args/value and blocks duplicate submissions.
- `signingMode` must be `'client-wallet'`; `userConsentRequired` must be `true`.

Two build outputs: typed ESM (`dist/index.js`) and a minified IIFE bundle (`dist/scaffhold-tx.min.js`, `ScaffHoldTx` global, zero runtime deps) produced by esbuild.

```bash
pnpm --filter @scaffhold/tx-client build
```

The runtime reads its config from `window.SCAFFHOLD_RUNTIME_CONFIG` (base64 or object), falling back to `data-campaign-config` on its own script tag. `ProjectRuntime.bind()` finds every `.interact-button` and re-scans on DOM mutations. `mount()` is a thin adapter over `ProjectRuntime` that adds a status region.

`ProjectRuntime` is the public API: `connect()`, `read()`, `write()`, `on()`. It selects WalletConnect v2 when a `walletConnectProjectId` is set, otherwise `window.ethereum`. WalletConnect is imported dynamically so injected-only hosts do not pay for it.

Tests for this package: `tests/tx-client-encoding.test.ts` (keccak/ABI vectors), `tests/tx-client-engine.test.ts` (guardrails + lifecycle), `tests/tx-client-browser.test.ts` (executes the real compiled standalone file in jsdom — run `pnpm --filter @scaffhold/tx-client build` first).

## Compilation service

`apps/compilation-service/src/runtime-bundle.ts` produces the deliverable. `buildProjectRuntime` prepends `window.SCAFFHOLD_RUNTIME_CONFIG={...};` to the built bundle (`loadRuntimeSource` reads `packages/tx-client/dist/scaffhold-tx.min.js` from disk, so `@scaffhold/tx-client` must be built first), hashes it, and returns `artifact.projectRuntime` with `fileName`, `source`, `config`, `integrity`, `sizeBytes`, and a stable `url`.

The integration contract is only two strings, returned as `artifact.inlineScript` (the script tag) and `artifact.runtime.buttonMarkup` (the `.interact-button` element). `artifact.runtime.bootstrapScript` is a preview harness page — a dashboard aid, not the product.

Serving: `POST /compilation/v1/compile` registers the source in `runtimeCache`; `GET /compilation/v1/runtime/:campaignId/:contentHash/:fileName` serves it immutably and `.../download` returns it as an attachment under the canonical content-hashed name. `RUNTIME_PUBLIC_BASE_URL` overrides the derived origin.

- It intentionally does **not** import `@scaffhold/tx-client` — the server is CommonJS and the runtime is browser ESM, so `validateRuntimeMethods` reimplements the ABI check and the config contract lives in `shared-types`.

`validateRuntimeMethods` rejects campaigns whose allowlisted methods are missing from the ABI or whose argument types do not match, and rejects an `action` that is not allowlisted, returning HTTP 400 `invalid_transaction_config`.

## Still scaffolded

Server-side persistence, audit logging, rate limiting, nonce locks, and scanner writes. The runtime cache is in-memory, so compiled files are lost on restart; production needs object storage behind the same stable URL. The server-side `transaction-engine` remains a status/simulation placeholder; real submission lives in `tx-client`.
