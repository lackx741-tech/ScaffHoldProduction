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
- CI workflow for install, lint, typecheck, test, and build

## Scaffold-only limitations

This repository is intentionally **not** a production implementation yet.

- Transaction signing and broadcasting are disabled.
- Arbitrary calldata is rejected by default.
- The transaction engine only exposes a clearly marked simulation/placeholder flow.
- Scanner routes are read-only placeholders.
- Compilation returns a deterministic placeholder artifact manifest instead of a real bundle.
- Redis/PostgreSQL wiring is scaffolded, but persistence, locks, idempotency, rate limits, and audit logging still need full implementation.

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
- inline bootstrap snippet
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
