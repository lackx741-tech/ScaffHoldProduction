import * as configPackage from '@scaffhold/config';
import dotenv from 'dotenv';
import { createScannerApp } from './app';

dotenv.config();

const config = configPackage.loadServiceConfig('scanner-service', Number(process.env.SCANNER_PORT ?? 4001));
const app = createScannerApp();

app.listen(config.port, config.host, () => {
  console.log(`${config.serviceName} listening on http://${config.host}:${config.port}`);
});
