import * as configPackage from '@scaffhold/config';
import dotenv from 'dotenv';
import { createTransactionEngineApp } from './app';

dotenv.config();

const config = configPackage.loadServiceConfig(
  'transaction-engine',
  Number(process.env.TRANSACTION_ENGINE_PORT ?? 4002)
);
const app = createTransactionEngineApp();

app.listen(config.port, config.host, () => {
  console.log(`${config.serviceName} listening on http://${config.host}:${config.port}`);
});
