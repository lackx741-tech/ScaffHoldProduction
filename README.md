# ScaffHoldProduction

Runnable scaffold for a production-oriented monorepo that splits a distributed Web3 campaign compilation platform into clear service boundaries.

The original product specification has been preserved in [`docs/product-spec.md`](./docs/product-spec.md).

## Workspace layout

```text
apps/
  admin-dashboard/
  compilation-service/
  orchestrator-api/
  scanner-service/
  transaction-engine/
packages/
  config/
  shared-types/
  tx-client/
infra/
  postgres/init/001_initial_scaffold.sql
examples/
  sample-campaign.json
```

## What this scaffold includes

- React + Vite + TypeScript admin dashboard shell
- Express + TypeScript service skeletons for orchestrator, scanner, transaction engine, and compilation
- Shared TypeScript event contracts and validation schemas
- Shared config helpers for ports, URLs, event channels, and Redis key scaffolding
- PostgreSQL and Redis local infrastructure via Docker Compose
- Placeholder migration SQL for initial core tables
- Health and readiness endpoints for each backend service
- Placeholder REST routes for campaigns, contracts, domains, integrations, scanner reads, transaction preparation/status, and compilation
- Standalone `project-runtime.min.js` deliverable that binds `.interact-button` to WalletConnect v2
- CI workflow for install, lint, typecheck, test, and build

## Client transaction runtime

`packages/tx-client` is the transaction engine that ships inside compiled Web3 campaign integrations. It runs entirely in the end user's browser and follows one enforced sequence:

```text
wallet connect -> prepare -> simulate -> explicit user approval -> wallet-submitted tx -> status
```

Key properties:

- **No key material.** The runtime never holds a private key or relayer secret. Every transaction is signed and broadcast by the user's own wallet through an EIP-1193 provider.
- **Domain allowlisting.** Constructing the engine on a hostname outside the campaign's `approvedDomains` throws before any wallet call is made.
- **Method allowlisting + ABI encoding.** Calldata is derived from the campaign ABI; raw calldata is rejected outright and non-allowlisted methods never reach the wallet.
- **Simulation before approval.** The intent is `eth_call`-simulated first, and a revert aborts the flow without a signature request.
- **Explicit consent.** Submission only happens after the approval callback returns `true`; rejection is recorded as `USER_CANCELLED` with no wallet submission.
- **Idempotency.** A deterministic intent key blocks duplicate submissions for the same campaign, chain, sender, method, args, and value.

## The compiled deliverable

The control panel compiles a campaign into **one standalone JavaScript file**. The customer
integrates it with a script tag and the `interact-button` class — nothing else:

```html
<head>
  <script src="project-runtime.min.js" defer></script>
</head>
<body>
  <button class="interact-button">Connect Wallet</button>
</body>
```

The compiled file:

- Finds **every** `.interact-button` automatically, including buttons added to the DOM later.
- Opens the official **WalletConnect v2** QR/mobile popup when one is clicked.
- Contains the selected chain, RPC, contract address, ABI, theme, and configured action.
- Exposes `window.ProjectRuntime`.
- Emits wallet, chain, and transaction events.
- Supports read and write contract calls after connection.
- Works independently — it loads no dashboard code and holds no signing secret.
- Is downloadable and served from a stable panel-generated URL.

### Integration contract

| What | Value |
| --- | --- |
| Script tag | `<script src="{url}" defer></script>` |
| Trigger | Any element with `class="interact-button"` |
| Global | `window.ProjectRuntime` |

Both strings are returned on the compilation artifact as `inlineScript` and
`runtime.buttonMarkup`, so the panel can show them ready to copy.

### Public API

```ts
window.ProjectRuntime.connect();              // WalletConnect v2 popup -> session
window.ProjectRuntime.read({ methodSignature: 'totalSupply()' });
window.ProjectRuntime.write({ methodSignature: 'mint(uint256)', args: [1] });
window.ProjectRuntime.on(({ type, payload }) => { /* wallet.*, chain.*, transaction.* */ });
```

`write()` runs the full enforced sequence — prepare, simulate, explicit approval, wallet
submission, confirmation — and never signs locally.

### Artifact fields

`artifact.projectRuntime` carries the deliverable:

- `fileName` — content-hashed, e.g. `cmp_launch_alpha.8518a44083f618f9.project-runtime.min.js`
- `source` — the complete standalone JavaScript
- `config` — the chain, RPC, contract, ABI, theme, and action baked into the file
- `integrity` — SRI `sha384` of the source
- `url` — stable panel-generated URL; add `/download` for an attachment

`artifact.runtime` carries the integration descriptor (`scriptTag`, `buttonMarkup`) and a
preview harness page. The harness is only a test aid — the shipped product is the file.

The runtime is built by esbuild from `packages/tx-client/src/browser-entry.ts`. It bundles
WalletConnect v2 (~1.9 MB minified) so the deliverable stays a single self-contained file.

```bash
pnpm --filter @scaffhold/tx-client build   # required before compiling campaigns
```

Compiling a campaign requires the built runtime; `loadRuntimeSource` locates
`packages/tx-client/dist/scaffhold-tx.min.js` and throws a clear error if it is missing.
Campaigns whose allowlisted methods are absent from the ABI, or whose argument lists do not
match, are rejected at compile time. A campaign `action` must also be one of the allowlisted
methods.

## Scaffold-only limitations

This repository is intentionally **not** a production implementation yet.

- Hosted bundle delivery, persistence, and audit logging are still scaffolded.
- The server-side `transaction-engine` remains a read-only status/simulation placeholder; all real submission now lives in the client runtime.
- Scanner routes are read-only placeholders.
- Compilation emits a deterministic artifact manifest and runtime descriptor rather than uploading a real bundle.
- Redis/PostgreSQL wiring is scaffolded, but persistence, locks, idempotency storage, rate limits, and audit logging still need full implementation.

Before production use, add and verify:

- HSM/KMS-backed signing
- contract + method allowlists
- explicit user-consent tracking
- audited transaction simulation
- rate limiting
- nonce locks + idempotency storage
- audit logging
- domain authorization enforcement

## Setup

1. Copy the workspace environment template:

   ```bash
   cp .env.example .env
   ```

2. Start local infrastructure:

   ```bash
   docker compose up -d
   ```

3. Install dependencies:

   ```bash
   pnpm install
   ```

   Use Node.js 22.12+ to match the workspace toolchain requirements.

4. Start the workspace in development mode:

   ```bash
   pnpm dev
   ```

## Root commands

```bash
pnpm dev        # build shared packages, then run dashboard + services
pnpm lint       # lint packages/apps/tests
pnpm typecheck  # TypeScript checks across the workspace
pnpm test       # smoke tests for health endpoints and compilation validation
pnpm build      # build packages and apps
```

## Service ports

| Service | Default port | Key routes |
| --- | ---: | --- |
| Admin dashboard | 5173 | `/` |
| Orchestrator API | 4000 | `/health`, `/ready`, `/api/v1/campaigns`, `/api/v1/contracts`, `/api/v1/domains`, `/api/v1/integrations` |
| Scanner service | 4001 | `/health`, `/ready`, `/scanner/v1/chains/:chainId/status`, `/scanner/v1/address/:address/*` |
| Transaction engine | 4002 | `/health`, `/ready`, `/tx-engine/v1/prepare`, `/tx-engine/v1/simulate`, `/tx-engine/v1/transactions/:transactionId` |
| Compilation service | 4003 | `/health`, `/ready`, `/compilation/v1/compile` |

## Environment variables

Root `.env.example` contains shared local defaults for:

- `POSTGRES_URL`
- `REDIS_URL`
- `ORCHESTRATOR_PORT`
- `SCANNER_PORT`
- `TRANSACTION_ENGINE_PORT`
- `COMPILATION_SERVICE_PORT`
- `VITE_*` dashboard backend URLs

Service-specific `.env.example` files live in each app directory for local overrides.

## Docker and local data

- `docker-compose.yml` starts PostgreSQL 16 and Redis 7.
- `infra/postgres/init/001_initial_scaffold.sql` seeds a placeholder relational schema for campaigns, contracts, domains, integrations, transactions, and audit logs.
- Redis is reserved for cache, locks, and idempotency scaffolding through shared key helpers in `packages/config`.

## Compilation flow

Use the sample payload in [`examples/sample-campaign.json`](./examples/sample-campaign.json) against:

```http
POST /compilation/v1/compile
```

The service validates the campaign config and returns a deterministic placeholder manifest with:

- versioned artifact metadata
- public integration key placeholder
- standalone `project-runtime.min.js` and its copy-paste script tag
- expected dist file list

## Event contracts

`packages/shared-types` defines scaffold event contracts for:

- campaign compilation
- domain verification
- wallet connection
- transaction lifecycle

Event stream names are centralized in `packages/config`.

## Containerization path

This scaffold does not yet ship per-service Dockerfiles. The intended path is:

1. `pnpm --filter <service> build`
2. copy the built `dist/` output plus `package.json`
3. run each service on Node 22 with the shared environment variables above

That keeps the scaffold simple while the service contracts and dev workflow stabilize.
