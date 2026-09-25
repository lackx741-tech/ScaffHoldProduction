import * as configPackage from '@scaffhold/config';
import * as sharedTypes from '@scaffhold/shared-types';
import express, { type Express } from 'express';

function validateTransactionPolicy(payload: unknown) {
  const parsed = sharedTypes.transactionPreparationRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400,
      body: { error: 'invalid_request', details: parsed.error.flatten() }
    };
  }

  if (parsed.data.calldata) {
    return {
      ok: false as const,
      status: 400,
      body: {
        error: 'arbitrary_calldata_rejected',
        message: 'The scaffold rejects arbitrary calldata by default.'
      }
    };
  }

  if (!parsed.data.allowlisted) {
    return {
      ok: false as const,
      status: 403,
      body: {
        error: 'method_not_allowlisted',
        message: 'Only explicitly allowlisted methods may enter the placeholder flow.'
      }
    };
  }

  if (!parsed.data.userConsentConfirmed) {
    return {
      ok: false as const,
      status: 400,
      body: {
        error: 'missing_user_consent',
        message: 'User consent must be recorded before any transaction preparation.'
      }
    };
  }

  return { ok: true as const, data: parsed.data };
}

export function createTransactionEngineApp(): Express {
  const config = configPackage.loadServiceConfig(
    'transaction-engine',
    Number(process.env.TRANSACTION_ENGINE_PORT ?? 4002)
  );
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: config.serviceName, timestamp: new Date().toISOString() });
  });

  app.get('/ready', (_req, res) => {
    res.json({
      status: 'ready',
      service: config.serviceName,
      timestamp: new Date().toISOString(),
      dependencies: configPackage.dependencySummary(config)
    });
  });

  app.post('/tx-engine/v1/prepare', (req, res) => {
    const validation = validateTransactionPolicy(req.body);
    if (!validation.ok) {
      return res.status(validation.status).json(validation.body);
    }

    return res.status(202).json({
      status: 'REQUESTED',
      mode: 'client-runtime',
      signing: 'client-wallet',
      broadcasting: 'client-wallet',
      transactionId: `tx_${validation.data.idempotencyKey}`,
      runtime: {
        package: '@scaffhold/tx-client',
        entrypoint: 'scaffhold-tx.min.js',
        flow: ['wallet.connect', 'prepare', 'simulate', 'approve', 'send', 'status']
      },
      redis: {
        lockKey: configPackage.redisKeys.lock('nonce', validation.data.campaignId),
        idempotencyKey: configPackage.redisKeys.idempotency(validation.data.idempotencyKey)
      },
      todos: configPackage.transactionEngineProductionTodos
    });
  });

  app.post('/tx-engine/v1/simulate', (req, res) => {
    const validation = validateTransactionPolicy(req.body);
    if (!validation.ok) {
      return res.status(validation.status).json(validation.body);
    }

    return res.json({
      status: 'SIMULATED',
      simulationResult: 'placeholder-success',
      gasEstimate: '21000',
      notes: [
        'Server-side simulation is stubbed; the client runtime performs eth_call simulation before requesting approval.',
        'Neither path signs or broadcasts on the server.'
      ]
    });
  });

  app.get('/tx-engine/v1/transactions/:transactionId', (req, res) => {
    res.json({
      transactionId: req.params.transactionId,
      status: 'CLIENT_MANAGED',
      message:
        'Submission is owned by the client-side transaction runtime and signed by the end user wallet. Server-side status persistence awaits the audit-log and idempotency store.'
    });
  });

  return app;
}
