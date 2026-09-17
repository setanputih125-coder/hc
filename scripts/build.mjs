import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';

await rm('dist', { recursive: true, force: true });
for (const args of [
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json'],
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'],
  ['node_modules/vite/bin/vite.js', 'build'],
]) {
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  const code = await new Promise((resolve) => {
    child.on('error', () => resolve(1));
    child.on('exit', resolve);
  });
  if (code !== 0) process.exit(code ?? 1);
}
