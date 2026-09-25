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
      mode: 'simulation-only',
      signing: 'disabled',
      broadcasting: 'disabled',
      transactionId: `tx_${validation.data.idempotencyKey}`,
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
      notes: ['Simulation is stubbed and does not sign, submit, or broadcast any transaction.']
    });
  });

  app.get('/tx-engine/v1/transactions/:transactionId', (req, res) => {
    res.json({
      transactionId: req.params.transactionId,
      status: 'DISABLED',
      message:
        'Broadcasting remains disabled until KMS/HSM, allowlists, audit logging, and simulation enforcement are implemented.'
    });
  });

  return app;
}
