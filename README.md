# ScaffoldHoldProduction

Minimal distributed Web3 campaign compilation scaffold with explicit service boundaries:

- `services/orchestrator`: campaign orchestration and compile request validation
- `services/scanner`: read-only chain state lookup abstraction
- `services/relayer`: transaction policy validation for consent/allowlists/idempotency
- `services/shared`: versioned event envelope + idempotency key helpers
- `services/frontend-admin`: wallet provider adapter interface for pluggable wallet providers

## Test

```bash
npm test
```
