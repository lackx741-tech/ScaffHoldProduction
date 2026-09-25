import * as configPackage from '@scaffhold/config';
import dotenv from 'dotenv';
import { createOrchestratorApp } from './app';

dotenv.config();

const config = configPackage.loadServiceConfig(
  'orchestrator-api',
  Number(process.env.ORCHESTRATOR_PORT ?? 4000)
);
const app = createOrchestratorApp();

app.listen(config.port, config.host, () => {
  console.log(`${config.serviceName} listening on http://${config.host}:${config.port}`);
});
