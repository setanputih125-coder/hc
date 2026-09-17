import { rm, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

async function run(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  const code = await new Promise((resolve) => {
    child.on('error', () => resolve(1));
    child.on('exit', resolve);
  });
  if (code !== 0) process.exit(code ?? 1);
}
await rm('.test-build', { recursive: true, force: true });
await run([
  'node_modules/typescript/bin/tsc',
  '-p',
  'tsconfig.server.json',
  '--outDir',
  '.test-build',
]);
const files = (await readdir('.test-build/tests'))
  .filter((name) => name.endsWith('.test.js'))
  .map((name) => `.test-build/tests/${name}`);
await run(['--test', ...files]);
