import { resolve } from 'node:path';
import { createApp } from './app.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
if (
  !['127.0.0.1', '::1', 'localhost'].includes(host) &&
  (!process.env.APP_PASSWORD || !process.env.PUBLIC_ORIGIN)
) {
  throw new Error(
    'LAN binding requires APP_PASSWORD and PUBLIC_ORIGIN. Use HOST=127.0.0.1 for same-device listening.',
  );
}
const origins = [
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];
if (process.env.PUBLIC_ORIGIN)
  origins.push(new URL(process.env.PUBLIC_ORIGIN).origin);
if (
  process.env.NODE_ENV === 'development' &&
  process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS
) {
  for (const name of process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS.split(
    ',',
  ))
    origins.push(`https://${name.trim()}`);
}
const { app } = await createApp({
  dataDir: process.env.DATA_DIR || './data',
  password: process.env.APP_PASSWORD,
  origins,
  clientDir: resolve('dist/client'),
});
const server = app.listen(port, host, () =>
  console.log(`Undertone is listening at http://${host}:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
