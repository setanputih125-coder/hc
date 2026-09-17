import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRailwayContext, project } from 'railway/iac';
import template from '../.railway/railway.js';
import { extractorError } from '../server/ytdlp.js';

test('Railway template defines one protected service with persistent storage', async () => {
  const definition = await template(
    createRailwayContext({ environment: 'production' }),
    project,
  );
  const resources = definition.resources!.flat();
  assert.equal(resources.length, 2);
  const service = resources.find((resource) => resource.type === 'service');
  const volume = resources.find((resource) => resource.type === 'volume');
  assert.ok(service && volume);
  assert.equal(service.source?.repo, 'setanputih152-afk/hc');
  assert.equal(service.source?.branch, 'hoplite/halikarnassos-8912bac6');
  assert.equal(service.build?.builder, 'DOCKERFILE');
  assert.equal(service.build?.dockerfilePath, 'Dockerfile');
  assert.equal(service.deploy?.healthcheckPath, '/healthz');
  assert.equal(service.deploy?.numReplicas, 1);
  assert.equal(service.deploy?.sleepApplication, false);
  assert.equal(service.deploy?.region, volume.config?.region);
  assert.deepEqual(service.variables?.APP_PASSWORD, {
    type: 'sharedReference',
    name: 'APP_PASSWORD',
  });
  for (const [name, value] of Object.entries({
    HOST: '0.0.0.0',
    PORT: '3000',
    DATA_DIR: '/data',
    PUBLIC_ORIGIN: 'https://${{RAILWAY_PUBLIC_DOMAIN}}',
  }))
    assert.deepEqual(service.variables?.[name], { type: 'literal', value });
  assert.equal(volume.config?.sizeMB, 1024);
  assert.equal(service.volumeAttachments?.[volume.name]?.mountPath, '/data');
  assert.equal(
    service.volumeAttachments?.[volume.name]?.volume,
    volume.address,
  );
});

test('container configuration excludes local secrets and includes both runtimes', async () => {
  const ignore = (await readFile('.dockerignore', 'utf8')).split('\n');
  for (const entry of [
    '.git', '.env', '.env.*', '.hoplite', '.venv', 'data', 'node_modules', 'dist',
  ])
    assert.ok(ignore.includes(entry), entry);
  const dockerfile = await readFile('Dockerfile', 'utf8');
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS runtime/);
  assert.match(dockerfile, /python3 python3-venv ca-certificates/);
  assert.match(dockerfile, /-r requirements\.txt/);
  assert.match(dockerfile, /npm ci/);
  assert.match(dockerfile, /npm run build && npm prune --omit=dev/);
  assert.match(dockerfile, /CMD \["node", "dist\/server\/index\.js"\]/);
  assert.doesNotMatch(dockerfile, /APP_PASSWORD=/);
});

test('app-owned UI copy and service errors do not expose extractor branding', async () => {
  const forbidden = /yt[\s_-]?dlp?|youtube-dl|extractor/i;
  async function inspect(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await inspect(file);
      else if (/\.(tsx?|css)$/.test(entry.name))
        assert.doesNotMatch(await readFile(file, 'utf8'), forbidden, file);
    }
  }
  await inspect('src');
  assert.doesNotMatch(await readFile('index.html', 'utf8'), forbidden);
  const app = await readFile('src/App.tsx', 'utf8');
  assert.doesNotMatch(app, /engine-chip|youtube-mark|track-format/);
  for (const stderr of ['No module named yt_dlp', 'yt-dlp unexpected failure'])
    assert.doesNotMatch(extractorError(stderr).message, forbidden);
});
