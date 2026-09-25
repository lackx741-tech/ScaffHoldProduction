import * as configPackage from '@scaffhold/config';
import dotenv from 'dotenv';
import { createCompilationServiceApp } from './app';

dotenv.config();

const config = configPackage.loadServiceConfig(
  'compilation-service',
  Number(process.env.COMPILATION_SERVICE_PORT ?? 4003)
);
const app = createCompilationServiceApp();

app.listen(config.port, config.host, () => {
  console.log(`${config.serviceName} listening on http://${config.host}:${config.port}`);
});
