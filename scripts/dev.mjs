import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: '3000',
};
const processes = [
  spawn(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'watch', '--env-file-if-exists=.env', 'server/index.ts'],
    { stdio: 'inherit', env },
  ),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
    stdio: 'inherit',
    env,
  }),
];
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const process of processes) process.kill('SIGTERM');
  setTimeout(() => globalThis.process.exit(code), 300).unref();
}
for (const child of processes) child.on('exit', (code) => close(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => close());
