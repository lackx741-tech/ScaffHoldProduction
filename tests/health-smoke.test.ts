import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createCompilationServiceApp } from '../apps/compilation-service/src/app';
import { createOrchestratorApp } from '../apps/orchestrator-api/src/app';
import { createScannerApp } from '../apps/scanner-service/src/app';
import { createTransactionEngineApp } from '../apps/transaction-engine/src/app';

describe('service health endpoints', () => {
  it.each([
    ['orchestrator', createOrchestratorApp()],
    ['scanner', createScannerApp()],
    ['transaction-engine', createTransactionEngineApp()],
    ['compilation', createCompilationServiceApp()]
  ])('%s exposes /health and /ready', async (_name, app) => {
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ready');
    expect(ready.body.dependencies).toBeDefined();
  });
});
