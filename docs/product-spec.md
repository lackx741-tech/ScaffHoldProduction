# Product Specification: Distributed Web3 Campaign Compilation Platform

## 1. System Architecture Overview

The platform is a distributed, event-driven microservices system for configuring, compiling, and embedding Web3 wallet integrations into authorized websites.

The system must not be implemented as a monolithic application. Each major capability should run as an independently deployable service with clearly defined APIs, events, permissions, and failure boundaries.

### Core Components

1. **Frontend Administrative Console**
   - React
   - TypeScript
   - Wallet integration configuration
   - Campaign and contract management
   - Transaction configuration
   - Modal customization
   - Compile and deployment workflows
   - Domain and integration management

2. **Backend Orchestrator**
   - Node.js
   - Express or Fastify
   - User authentication and sessions
   - API key management
   - Campaign orchestration
   - Contract configuration
   - Compilation requests
   - Domain authorization
   - Service-to-service coordination

3. **Scanner Microservice**
   - Node.js or TypeScript
   - `web3.js` or `viem`
   - Reads blockchain state
   - Retrieves:
     - Native token balances
     - ERC-20 balances
     - Token allowances
     - NFT ownership
     - NFT collection metadata
     - NFT floor-price data
     - Contract and network information
   - Must be read-only and must never sign or broadcast transactions.

4. **Relayer / Transaction Engine**
   - Constructs and submits authorized transactions
   - Supports private transaction infrastructure where appropriate
   - Uses secure transaction signing
   - Supports Flashbots or approved private mempool providers
   - Handles nonce management
   - Tracks transaction status
   - Must require explicit user consent before wallet transactions are initiated.
   - Must not hide transaction details or misrepresent transaction intent.

5. **Database Layer**
   - PostgreSQL for durable relational data
   - Redis for short-lived and high-speed data:
     - Asset prices
     - Nonces
     - Session data
     - Rate-limit counters
     - Compilation locks
     - Temporary job state

6. **Compilation Service**
   - Converts dashboard configuration into an embeddable integration package.
   - Generates:
     - Inline JavaScript
     - Hosted JavaScript bundle
     - Configuration manifest
     - Domain restrictions
     - Wallet-connect button integration
   - Validates configuration before generating output.

7. **Event Bus**
   - Used for asynchronous service communication.
   - Recommended options:
     - RabbitMQ
     - Kafka
     - NATS
     - Redis Streams for an initial implementation
   - Events should be versioned and idempotent.

---

# 2. Product Goals

The platform must allow an administrator to:

1. Select a supported blockchain network.
2. Select or configure a smart contract.
3. Configure supported transaction actions.
4. Configure the wallet connection experience.
5. Configure the modal displayed to users.
6. Select a wallet integration provider.
7. Preview the integration.
8. Compile the configuration into an embeddable script.
9. Restrict the integration to approved domains.
10. Copy or download the generated integration code.
11. Monitor wallet connections, user approvals, transactions, and errors.
12. Rotate or revoke API keys and generated integrations.

---

# 3. High-Level User Flow

## 3.1 Campaign Creation

1. Administrator signs into the administrative console.
2. Administrator creates a new campaign or integration.
3. Administrator selects:
   - Campaign name
   - Target blockchain
   - Network or chain ID
   - Contract address
   - Contract ABI
   - Supported wallet providers
   - Approved domains
4. System validates the contract address and ABI.
5. Scanner service verifies that the contract exists on the selected network.
6. Administrator configures the wallet-connect experience.
7. Administrator previews the modal.
8. Administrator compiles the configuration.
9. System generates an integration bundle.
10. Administrator receives an inline script and integration instructions.

## 3.2 End-User Wallet Connection

1. End user visits an approved domain.
2. The embedded script initializes.
3. The wallet connection button is rendered.
4. The end user clicks the button.
5. The configured wallet provider opens.
6. The end user selects and connects a wallet.
7. The integration displays:
   - Connected wallet address
   - Selected network
   - Relevant asset information
   - User-facing campaign information
   - Available actions, if any
8. Any transaction action must display:
   - Target contract
   - Network
   - Transaction type
   - Estimated gas
   - Assets or permissions involved
   - Clear confirmation language
9. The end user explicitly approves the wallet transaction.
10. The wallet signs the transaction.
11. The transaction engine submits or monitors the transaction.
12. The user sees the transaction status and transaction hash.

---

# 4. Compile Dashboard

## 4.1 Dashboard Sections

### A. Campaign Details

Fields:

- Campaign name
- Campaign description
- Campaign status:
  - Draft
  - Preview
  - Compiled
  - Published
  - Paused
  - Archived
- Environment:
  - Development
  - Staging
  - Production
- Owner
- Created date
- Updated date

### B. Contract Selection

The administrator must be able to:

- Select an existing contract.
- Add a new contract address.
- Select a blockchain network.
- Upload or paste a contract ABI.
- Validate the contract.
- View supported contract methods.
- Mark permitted methods for use in the campaign.
- Configure method parameters.
- Specify whether a method is:
  - Read-only
  - User-signed
  - Backend-relayed
  - Disabled

The system must prevent arbitrary contract methods from being executed without explicit configuration and authorization.

### C. Transaction Engine Configuration

The transaction engine configuration should include:

- Chain ID
- RPC configuration
- Gas strategy
- Maximum gas limit
- EIP-1559 settings
- Nonce strategy
- Transaction timeout
- Retry policy
- Confirmation threshold
- Private transaction provider
- Relayer wallet configuration
- Transaction simulation settings
- Failure and rollback handling

Sensitive credentials must never be stored in frontend code or generated inline scripts.

### D. Wallet Provider Selection

The administrator can select one or more wallet integration providers, such as:

- Reown / WalletConnect
- WalletConnect v2
- RainbowKit
- Injected browser wallets
- Mobile deep-link providers

The platform must use a provider adapter interface so that wallet integrations can be added or replaced without changing the rest of the system.

Example adapter interface:

```typescript name=wallet-provider-adapter.ts
export interface WalletProviderAdapter {
  id: string;
  displayName: string;
  initialize(config: WalletProviderConfig): Promise<void>;
  connect(): Promise<WalletConnection>;
  disconnect(): Promise<void>;
  getAccount(): Promise<string | null>;
  getChainId(): Promise<number | null>;
  switchChain(chainId: number): Promise<void>;
  signTransaction(
    request: TransactionRequest
  ): Promise<SignedTransaction>;
}
```

### E. Modal Configuration

The dashboard must support configuration of the wallet-connect modal.

Configurable fields:

- Modal title
- Subtitle
- Logo
- Theme:
  - Light
  - Dark
  - System
- Primary color
- Secondary color
- Border radius
- Button labels
- Success message
- Error message
- Loading message
- Network warning
- Unsupported-wallet message
- Transaction confirmation content
- Terms and disclosure links
- Privacy-policy link
- Help link

The modal must clearly identify the purpose of any transaction or permission request. It must not use deceptive wording, hidden actions, or misleading UI elements.

### F. Asset and Chain State Display

The integration may display information read by the Scanner Service, including:

- Native token balance
- ERC-20 token balances
- Token allowances
- NFT ownership
- NFT collection information
- NFT floor-price estimates
- Current network
- Contract interaction status

Asset values must include:

- Timestamp
- Data source
- Chain/network
- Confidence or freshness indicator where applicable

### G. Domain Configuration

Administrators must define which websites can load and use the generated integration.

Domain fields:

- Domain
- Environment
- Status
- Verification method
- Verification status
- Date added
- Date verified
- Last activity

Supported verification methods:

- DNS TXT record
- HTML file
- Meta tag
- Manual administrator approval

Requests from unapproved domains must be rejected by the backend and integration API.

---

# 5. Compilation Process

## 5.1 Compile Requirements

When the administrator clicks **Compile**, the system must:

1. Validate all required fields.
2. Validate the chain ID.
3. Validate the contract address.
4. Validate the ABI.
5. Validate selected contract methods.
6. Validate wallet-provider configuration.
7. Validate approved domains.
8. Check for missing security disclosures.
9. Create an immutable configuration version.
10. Generate a bundle.
11. Generate an inline script.
12. Generate an integration manifest.
13. Generate a version identifier.
14. Store the compiled artifact.
15. Return installation instructions.

## 5.2 Compilation Output

The compilation service should generate:

```text
dist/
├── integration.js
├── integration.min.js
├── integration.css
├── manifest.json
├── integrity.json
└── README.md
```

The generated output should include:

- Campaign ID
- Configuration version
- Supported chains
- Wallet providers
- Approved domains
- Public integration key
- Bundle version
- Content hash
- Subresource Integrity hash
- Expiration or revocation metadata

The inline script should contain public configuration only.

It must not contain:

- Private keys
- Relayer secrets
- Database credentials
- RPC provider secrets
- Internal service tokens
- Backend signing credentials

## 5.3 Example Integration Script

The compiled deliverable is a single standalone JavaScript file. The host page loads it with a
script tag, and any element carrying the `interact-button` class becomes a wallet-connect
trigger. No other integration code is required.

```html name=integration-example.html
<head>
  <script src="https://cdn.example.com/integrations/campaign_123/project-runtime.min.js" defer></script>
</head>

<body>
  <button class="interact-button">
    Connect Wallet
  </button>
</body>
```

The compiled file contains the selected chain, RPC endpoint, contract address, ABI, modal theme,
and configured action. It opens the official WalletConnect v2 QR/mobile popup, exposes
`window.ProjectRuntime`, emits wallet/chain/transaction events, and supports read and write
contract calls after connection. It runs independently of the dashboard and holds no signing
secret.

The runtime also supports an inline bootstrap option when a host cannot load an external file.

---

# 6. Backend Services

## 6.1 Orchestrator API

### Authentication

```http
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
```

### Campaigns

```http
GET    /api/v1/campaigns
POST   /api/v1/campaigns
GET    /api/v1/campaigns/:campaignId
PATCH  /api/v1/campaigns/:campaignId
DELETE /api/v1/campaigns/:campaignId
POST   /api/v1/campaigns/:campaignId/compile
POST   /api/v1/campaigns/:campaignId/publish
POST   /api/v1/campaigns/:campaignId/pause
```

### Contracts

```http
GET    /api/v1/contracts
POST   /api/v1/contracts
GET    /api/v1/contracts/:contractId
POST   /api/v1/contracts/validate
POST   /api/v1/contracts/:contractId/simulate
```

### Domains

```http
GET    /api/v1/campaigns/:campaignId/domains
POST   /api/v1/campaigns/:campaignId/domains
DELETE /api/v1/campaigns/:campaignId/domains/:domainId
POST   /api/v1/domains/:domainId/verify
```

### Integrations

```http
GET    /api/v1/campaigns/:campaignId/integrations
GET    /api/v1/integrations/:integrationId
POST   /api/v1/integrations/:integrationId/revoke
GET    /api/v1/integrations/:integrationId/download
```

### Transactions

```http
POST /api/v1/transactions/prepare
POST /api/v1/transactions/simulate
POST /api/v1/transactions/submit
GET  /api/v1/transactions/:transactionId
```

All transaction endpoints must enforce:

- Authentication
- Campaign authorization
- Domain authorization
- Contract-method allowlists
- User-consent verification
- Rate limits
- Replay protection
- Idempotency keys

---

# 7. Scanner Microservice

## 7.1 Responsibilities

The Scanner Service is responsible for blockchain read operations only.

It must support:

- Chain health checks
- Contract existence checks
- Balance lookups
- Allowance lookups
- NFT ownership checks
- NFT metadata retrieval
- Collection floor-price retrieval
- Token metadata retrieval
- Transaction receipt lookup
- Event-log scanning

## 7.2 Scanner API

```http
GET /scanner/v1/chains/:chainId/status
GET /scanner/v1/address/:address/balances
GET /scanner/v1/address/:address/allowances
GET /scanner/v1/address/:address/nfts
GET /scanner/v1/contracts/:address
GET /scanner/v1/transactions/:hash
```

## 7.3 Scanner Constraints

- No private-key access.
- No transaction signing.
- No transaction broadcasting.
- Provider fallback support.
- Request timeout enforcement.
- RPC response validation.
- Per-chain rate limits.
- Cache frequently requested data in Redis.
- Record source and timestamp for price data.

---

# 8. Relayer and Transaction Engine

## 8.1 Responsibilities

The Relayer Service must:

- Accept only validated transaction requests.
- Verify that the requested method is allowed.
- Estimate gas.
- Simulate transactions.
- Construct transaction payloads.
- Sign transactions using a secure key-management system.
- Submit transactions through the configured provider.
- Track transaction lifecycle.
- Handle retries and replacement transactions.
- Emit status events.

## 8.2 Transaction Lifecycle

```text
REQUESTED
  ↓
VALIDATED
  ↓
SIMULATED
  ↓
AWAITING_USER_APPROVAL
  ↓
SIGNED
  ↓
SUBMITTED
  ↓
PENDING
  ↓
CONFIRMED
```

Failure states:

```text
REJECTED
SIMULATION_FAILED
USER_CANCELLED
SUBMISSION_FAILED
REPLACED
EXPIRED
REVERTED
```

## 8.3 Security Requirements

The Relayer Service must use:

- Hardware-backed key storage or managed KMS.
- Key rotation.
- Transaction allowlists.
- Spending and gas limits.
- Per-campaign quotas.
- Per-user rate limits.
- Nonce locking.
- Idempotency keys.
- Audit logging.
- Emergency pause controls.

The service must not execute arbitrary calldata received directly from the browser.

---

# 9. Database Model

## 9.1 Core PostgreSQL Tables

### users

```text
id
email
password_hash
role
status
created_at
updated_at
last_login_at
```

### campaigns

```text
id
name
description
status
environment
owner_id
created_at
updated_at
```

### chains

```text
id
chain_id
name
native_currency
rpc_provider
status
created_at
updated_at
```

### contracts

```text
id
campaign_id
chain_id
address
abi
verified
created_at
updated_at
```

### contract_methods

```text
id
contract_id
method_name
method_signature
method_type
enabled
requires_user_confirmation
created_at
updated_at
```

### domains

```text
id
campaign_id
domain
environment
verification_method
verification_status
verified_at
created_at
updated_at
```

### integrations

```text
id
campaign_id
version
public_key
bundle_hash
status
compiled_at
revoked_at
```

### transactions

```text
id
campaign_id
wallet_address
chain_id
contract_address
method_signature
transaction_hash
status
gas_limit
gas_used
created_at
updated_at
```

### audit_logs

```text
id
user_id
campaign_id
event_type
metadata
ip_address
user_agent
created_at
```

---

# 10. Redis Usage

Redis should be used for short-lived or high-frequency data:

- Scanner response cache
- Token price cache
- NFT floor-price cache
- Chain health cache
- Transaction nonces
- Distributed locks
- Session cache
- Rate limits
- Compilation job locks
- Temporary wallet connection state
- Idempotency keys

Redis data must have appropriate expiration times and must not be considered the source of truth for durable records.

---

# 11. Event-Driven Communication

## 11.1 Event Examples

```text
campaign.created
campaign.updated
campaign.compilation.requested
campaign.compilation.completed
campaign.compilation.failed
domain.verification.requested
domain.verified
wallet.connected
wallet.disconnected
transaction.requested
transaction.simulated
transaction.submitted
transaction.confirmed
transaction.failed
integration.published
integration.revoked
```

## 11.2 Event Requirements

Each event must include:

- Event ID
- Event type
- Event version
- Timestamp
- Source service
- Correlation ID
- Campaign ID
- User ID where applicable
- Payload
- Retry metadata

Consumers must be idempotent and able to safely process duplicate events.

---

# 12. Security and Compliance Requirements

The platform must include the following safeguards:

1. Explicit user approval before signing or submitting transactions.
2. Clear display of transaction intent.
3. No hidden or automatically triggered wallet actions.
4. No misleading wallet-connect prompts.
5. No unauthorized collection of wallet data.
6. Domain allowlisting.
7. API authentication and authorization.
8. Role-based access control.
9. Secure secret storage.
10. Encryption in transit and at rest.
11. Audit logs for all administrative and transaction actions.
12. Rate limiting and abuse detection.
13. Contract and method allowlists.
14. Transaction simulation before signing.
15. Emergency campaign pause.
16. Integration revocation.
17. Relayer spending limits.
18. Key rotation and emergency key destruction.
19. User-facing privacy and consent disclosures.
20. Protection against replay attacks and duplicate submissions.

---

# 13. Observability

Each service must provide:

- Structured logs
- Metrics
- Traces
- Health endpoints
- Readiness endpoints
- Correlation IDs
- Error tracking

Recommended endpoints:

```http
GET /health
GET /ready
GET /metrics
```

Important metrics include:

- Wallet connection count
- Connection failure rate
- Compilation success rate
- Compilation duration
- Scanner RPC latency
- Scanner cache hit rate
- Transaction simulation failures
- Transaction submission failures
- Transaction confirmation time
- Relayer nonce conflicts
- API error rate
- Unauthorized-domain requests

---

# 14. Deployment Architecture

Recommended deployment model:

```text
                 ┌─────────────────────┐
                 │ React Admin Console │
                 └──────────┬──────────┘
                            │
                   ┌────────▼────────┐
                   │ API Gateway /    │
                   │ Backend Gateway  │
                   └────────┬────────┘
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
┌──────▼──────┐     ┌───────▼──────┐     ┌───────▼──────┐
│ Orchestrator│     │ Compilation   │     │ Auth / API   │
│ Service     │     │ Service       │     │ Service      │
└──────┬──────┘     └───────┬──────┘     └──────────────┘
       │                    │
       │            ┌───────▼──────┐
       │            │ Object/CDN   │
       │            │ Bundle Store │
       │            └──────────────┘
       │
 ┌─────▼─────┐       ┌────────────┐
 │ PostgreSQL│       │   Redis    │
 └───────────┘       └────────────┘
       │
       ├───────────────────────┐
       │                       │
┌──────▼──────┐        ┌───────▼──────┐
│ Scanner     │        │ Relayer /    │
│ Service     │        │ Tx Engine    │
└─────────────┘        └──────────────┘
```

Each service should be independently deployable using containers and should communicate through authenticated APIs and an event bus.

---

# 15. Non-Functional Requirements

## Performance

- Dashboard API response time: under 500 ms for normal requests.
- Scanner cached response: under 200 ms.
- Compilation job completion: under 30 seconds for standard campaigns.
- Wallet connection initialization: under 2 seconds excluding wallet-provider latency.
- Transaction status updates: near real-time through WebSockets or server-sent events.

## Availability

- Administrative API target: 99.9% availability.
- Scanner service should support provider failover.
- Compilation artifacts should be immutable and recoverable.
- Transaction records must be durable even if downstream providers fail.

## Scalability

The system must support independent horizontal scaling of:

- API services
- Scanner workers
- Compilation workers
- Transaction workers
- Event consumers
- WebSocket connections

---

# 16. Recommended Implementation Phases

## Phase 1: Foundation

- Repository setup
- Authentication
- User roles
- PostgreSQL schema
- Redis setup
- API gateway
- Basic React dashboard
- Campaign CRUD

## Phase 2: Contract and Chain Configuration

- Chain management
- Contract registration
- ABI upload
- Contract validation
- Method allowlists
- Scanner service
- Read-only balance and contract inspection

## Phase 3: Wallet Integration

- Provider adapter interface
- Reown / WalletConnect integration
- RainbowKit integration
- Wallet connection modal
- Domain allowlisting
- Connection event tracking

## Phase 4: Compilation

- Campaign configuration validation
- Compilation service
- Bundle generation
- Inline script generation
- CDN or object-storage publishing
- Versioned integration artifacts

## Phase 5: Transaction Engine

- Transaction simulation
- Explicit user approval flow
- Relayer service
- Secure key management
- Nonce management
- Transaction lifecycle tracking

## Phase 6: Operations and Security

- Audit logs
- Monitoring
- Rate limits
- Emergency pause
- Integration revocation
- Key rotation
- Security testing
- Penetration testing
- Production deployment

---

# 17. Definition of Done

The system is considered complete when:

- An administrator can create and configure a campaign.
- A contract can be validated against a supported blockchain.
- Contract methods can be explicitly allowlisted.
- Scanner data can be displayed in the dashboard and integration.
- Wallet providers can be selected and initialized.
- Modal content can be customized.
- Approved domains can be configured and verified.
- The campaign can be compiled successfully.
- The platform generates a versioned JavaScript integration.
- The integration can render a wallet-connect button on an authorized domain.
- Users receive clear transaction information before approval.
- Transactions are simulated, signed, submitted, and tracked securely.
- Relayer keys are never exposed to the frontend.
- All important actions are audited.
- Administrators can pause, revoke, and redeploy integrations.
- Automated tests cover authentication, compilation, domain restrictions, scanner operations, transaction validation, and failure handling.
