import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createApp } from '../server/app.js';
import { Collection } from '../server/collection.js';
import { parseRange } from '../server/range.js';
import type { MusicService } from '../server/ytdlp.js';
import type { LyricsService } from '../server/lyrics.js';
import type { Track } from '../shared/types.js';

const track: Track = {
  id: 'abcdefghijk',
  source: 'youtube',
  title: 'Original test track',
  artist: 'Test artist',
  album: 'Test album',
  duration: 30,
  externalUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
};
const second: Track = {
  ...track,
  id: 'lmnopqrstuv',
  title: 'Second test track',
};
const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
const lyricService: LyricsService = {
  lookup: async () => ({
    lines: [{ time: 0, text: 'Original test words' }],
    plain: 'Original test words',
    origin: 'lrclib',
    matched: true,
  }),
  search: async () => [],
  get: async () => ({
    lines: [],
    plain: 'Original test words',
    origin: 'lrclib',
  }),
};

async function fixture(password?: string) {
  const dataDir = await mkdtemp(join(tmpdir(), 'undertone-online-'));
  const refreshes: boolean[] = [];
  const lyricSearches: { query: string; duration: number }[] = [];
  const lyricLookups: number[] = [];
  let blocked = false;
  let hostile = false;
  let redirected = false;
  const music: MusicService = {
    health: async () => ({
      available: true,
      version: 'test',
      engine: 'yt-dlp',
    }),
    search: async () => ({ tracks: [track, second], title: 'Test results' }),
    playlist: async () => ({
      tracks: [track, second],
      title: 'YouTube playlist',
    }),
    radio: async (id) => ({
      tracks: [{ ...second, id: 'radiotrack1' }],
      title: `Radio mix for ${id}`,
    }),
    track: async (id) => ({ ...(id === second.id ? second : track), id }),
    audio: async (id, _format, refresh = false) => {
      refreshes.push(refresh);
      return {
        track: { ...track, id },
        url: hostile
          ? 'https://127.0.0.1/private'
          : 'https://rr1-test.googlevideo.com/audio',
        headers: { 'User-Agent': 'Extractor test' },
        contentType: 'audio/webm',
      };
    },
  };
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(new URL(String(input)).hostname, 'rr1-test.googlevideo.com');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('user-agent'), 'Extractor test');
    assert.equal(headers.get('cookie'), null);
    if (redirected)
      return new Response(null, {
        status: 302,
        headers: { Location: 'http://127.0.0.1/private' },
      });
    if (blocked) {
      blocked = false;
      return new Response(null, { status: 403 });
    }
    const range =
      headers.get('if-range') && headers.get('if-range') !== '"test-etag"'
        ? undefined
        : parseRange(headers.get('range') ?? undefined, bytes.length);
    if (range === 'invalid')
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${bytes.length}` },
      });
    const body = range ? bytes.slice(range.start, range.end + 1) : bytes;
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Length': String(body.length),
        'Accept-Ranges': 'bytes',
        ETag: '"test-etag"',
        ...(range
          ? {
              'Content-Range': `bytes ${range.start}-${range.end}/${bytes.length}`,
            }
          : {}),
      },
    });
  };
  const { app } = await createApp({
    dataDir,
    password,
    music,
    lyrics: {
      ...lyricService,
      search: async (query, duration) => {
        lyricSearches.push({ query, duration });
        return lyricService.search(query, duration);
      },
      lookup: async (track) => {
        lyricLookups.push(track.duration);
        return lyricService.lookup(track);
      },
    },
    fetcher,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No listener');
  const base = `http://127.0.0.1:${address.port}`;
  const send = (
    path: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(base + path, {
      method,
      headers: {
        'X-Undertone': '1',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return {
    base,
    dataDir,
    send,
    refreshes,
    lyricSearches,
    lyricLookups,
    setBlocked: () => {
      blocked = true;
    },
    setHostile: (value: boolean) => {
      hostile = value;
    },
    setRedirected: (value: boolean) => {
      redirected = value;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

test('deployment healthchecks stay public without weakening host or session checks', async (t) => {
  const f = await fixture('test-password');
  t.after(f.close);
  const probe = (path: string, method = 'GET') =>
    new Promise<{ status: number; body: string; cacheControl?: string }>(
      (resolve, reject) => {
        const req = request(
          f.base + path,
          { method, headers: { Host: 'healthcheck.railway.app' } },
          (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('error', reject);
            res.on('end', () => {
              resolve({
                status: res.statusCode!,
                body,
                cacheControl: res.headers['cache-control'],
              });
            });
          },
        );
        req.on('error', reject);
        req.end();
      },
    );
  const response = await probe('/healthz');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { status: 'ok' });
  assert.equal(response.cacheControl, 'no-store');
  assert.equal((await probe('/healthz', 'HEAD')).status, 200);
  assert.equal((await f.send('/api/library')).status, 401);
  assert.equal((await probe('/api/library')).status, 403);
  assert.equal((await probe('/api/health')).status, 403);
});

test('lyrics HTTP routes validate duration and pass the current player duration to the provider', async (t) => {
  const f = await fixture();
  t.after(f.close);
  for (const suffix of [
    '',
    '&duration=',
    '&duration=0',
    '&duration=-1',
    '&duration=NaN',
    '&duration=Infinity',
    '&duration=abc',
    '&duration[]=240',
    '&duration=240&duration=241',
  ]) {
    assert.equal(
      (await f.send(`/api/lyrics/search?q=test${suffix}`)).status,
      400,
      suffix,
    );
    if (suffix)
      assert.equal(
        (await f.send(`/api/tracks/${track.id}/lyrics?${suffix.slice(1)}`)).status,
        400,
        suffix,
      );
  }
  assert.deepEqual(f.lyricSearches, []);
  assert.deepEqual(f.lyricLookups, []);
  assert.equal(
    (await f.send('/api/lyrics/search?q=Test%20song&duration=240.75')).status,
    200,
  );
  assert.deepEqual(f.lyricSearches, [
    { query: 'Test song', duration: 240.75 },
  ]);
  assert.equal(
    (await f.send(`/api/tracks/${track.id}/lyrics?duration=240.75`)).status,
    200,
  );
  assert.equal(
    (await f.send(`/api/tracks/${track.id}/lyrics`)).status,
    200,
  );
  assert.deepEqual(f.lyricLookups, [240.75, track.duration]);
});

test('real HTTP online music, range proxy, remote playlists and online lyrics', async (t) => {
  const f = await fixture();
  t.after(f.close);
  await t.test(
    'search, health and resolve expose metadata but never signed URLs or headers',
    async () => {
      assert.equal(
        (await (await f.send('/api/health')).json()).engine,
        'yt-dlp',
      );
      assert.equal(
        (await (await f.send('/api/search?q=test')).json()).tracks.length,
        2,
      );
      const result = await (
        await f.send(`/api/tracks/${track.id}/resolve`)
      ).json();
      assert.equal(result.title, track.title);
      assert.equal(result.url, undefined);
      assert.equal(result.headers, undefined);
    },
  );
  await t.test(
    'streaming preserves exact bytes and upstream 206 range semantics',
    async () => {
      for (const range of ['bytes=2-7', 'bytes=200-', 'bytes=-12']) {
        const response = await f.send(
          `/api/tracks/${track.id}/stream`,
          'GET',
          undefined,
          { Range: range },
        );
        const parsed = parseRange(range, bytes.length);
        assert.ok(parsed && parsed !== 'invalid');
        assert.equal(response.status, 206);
        assert.equal(
          response.headers.get('content-range'),
          `bytes ${parsed.start}-${parsed.end}/256`,
        );
        assert.deepEqual(
          new Uint8Array(await response.arrayBuffer()),
          bytes.slice(parsed.start, parsed.end + 1),
        );
        assert.equal(response.headers.get('content-type'), 'audio/webm');
      }
    },
  );
  await t.test(
    'HEAD, complete streams, If-Range, multipart fallback and 416 remain correct',
    async () => {
      const head = await f.send(`/api/tracks/${track.id}/stream`, 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('content-length'), '256');
      assert.equal(head.headers.get('content-range'), null);
      assert.equal((await head.arrayBuffer()).byteLength, 0);
      const rangeHead = await f.send(
        `/api/tracks/${track.id}/stream`,
        'HEAD',
        undefined,
        { Range: 'bytes=4-9' },
      );
      assert.equal(rangeHead.status, 206);
      assert.equal(rangeHead.headers.get('content-length'), '6');
      const unsatisfiable = await f.send(
        `/api/tracks/${track.id}/stream`,
        'GET',
        undefined,
        { Range: 'bytes=999-' },
      );
      assert.equal(unsatisfiable.status, 416);
      assert.equal(unsatisfiable.headers.get('content-range'), 'bytes */256');
      for (const headers of [
        {},
        { Range: 'bytes=0-1,5-6' },
        { Range: 'bytes=0-1', 'If-Range': '"old"' },
      ] as Record<string, string>[]) {
        const response = await f.send(
          `/api/tracks/${track.id}/stream`,
          'GET',
          undefined,
          headers,
        );
        assert.equal(response.status, 200);
        assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
      }
    },
  );
  await t.test(
    'expired URLs refresh once; arbitrary hosts and unsafe redirects are rejected',
    async () => {
      f.refreshes.length = 0;
      f.setBlocked();
      const retried = await f.send(
        `/api/tracks/${track.id}/stream`,
        'GET',
        undefined,
        { Range: 'bytes=0-3' },
      );
      assert.equal(retried.status, 206);
      await retried.arrayBuffer();
      assert.deepEqual(f.refreshes, [false, true]);
      f.setHostile(true);
      assert.equal(
        (await f.send(`/api/tracks/${track.id}/stream`)).status,
        502,
      );
      f.setHostile(false);
      f.setRedirected(true);
      assert.equal(
        (await f.send(`/api/tracks/${track.id}/stream`)).status,
        502,
      );
      f.setRedirected(false);
      assert.equal((await f.send('/api/tracks/invalid/stream')).status, 400);
    },
  );
  await t.test(
    'favorite and playlist mutations are ordered, serialized and durable',
    async () => {
      assert.equal(
        (await f.send('/api/favorites', 'POST', { trackId: track.id })).status,
        200,
      );
      const playlist = await (
        await f.send('/api/playlists', 'POST', { name: 'Test playlist' })
      ).json();
      await Promise.all([
        f.send(`/api/playlists/${playlist.id}/tracks`, 'POST', {
          trackId: track.id,
        }),
        f.send(`/api/playlists/${playlist.id}/tracks`, 'POST', {
          trackId: second.id,
        }),
      ]);
      let library = await (await f.send('/api/library')).json();
      assert.equal(library.playlists[0].trackIds.length, 2);
      assert.equal(
        (
          await f.send(`/api/playlists/${playlist.id}`, 'PUT', {
            trackIds: [second.id, track.id],
          })
        ).status,
        200,
      );
      await f.send(`/api/favorites/${track.id}`, 'DELETE');
      const restored = new Collection(f.dataDir);
      await restored.init();
      assert.deepEqual(restored.library.playlists[0].trackIds, [
        second.id,
        track.id,
      ]);
      assert.equal(restored.library.favorites.length, 0);
      assert.equal(restored.library.tracks.length, 2);
      await f.send(`/api/playlists/${playlist.id}`, 'DELETE');
      library = await (await f.send('/api/library')).json();
      assert.equal(library.tracks.length, 0);
    },
  );
  await t.test(
    'lyrics are online only and turning them off prevents provider requests',
    async () => {
      const lyrics = await (
        await f.send(`/api/tracks/${track.id}/lyrics`)
      ).json();
      assert.equal(lyrics.origin, 'lrclib');
      assert.equal(lyrics.lines[0].time, 0);
      assert.equal(
        (
          await f.send('/api/settings', 'PUT', {
            audioFormat: 'm4a',
            lyricsEnabled: false,
          })
        ).status,
        200,
      );
      assert.equal(
        (await f.send(`/api/tracks/${track.id}/lyrics`)).status,
        403,
      );
      assert.equal((await f.send('/api/lyrics/search?q=test')).status, 403);
      assert.equal((await f.send('/api/library/scan', 'POST')).status, 404);
      assert.equal(
        (
          await f.send('/api/settings', 'PUT', {
            audioFormat: 'flac',
            lyricsEnabled: true,
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    'cross-site requests, missing mutation markers and unknown routes fail explicitly',
    async () => {
      assert.equal(
        (
          await f.send('/api/search?q=test', 'GET', undefined, {
            Origin: 'https://evil.example',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await f.send(
            '/api/playlists',
            'POST',
            { name: 'Bad' },
            { 'X-Undertone': '' },
          )
        ).status,
        403,
      );
      assert.equal((await f.send('/api/missing')).status, 404);
    },
  );
});

test('password session protects search, audio, preferences and collections', async (t) => {
  const f = await fixture('test-password');
  t.after(f.close);
  for (const path of [
    '/api/search?q=test',
    '/api/settings',
    '/api/library',
    `/api/tracks/${track.id}/stream`,
  ])
    assert.equal((await f.send(path)).status, 401);
  assert.equal(
    (await f.send('/api/session', 'POST', { password: 'wrong' })).status,
    401,
  );
  const login = await f.send('/api/session', 'POST', {
    password: 'test-password',
  });
  const cookie = login.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(
    (await f.send('/api/library', 'GET', undefined, { Cookie: cookie })).status,
    200,
  );
  await f.send('/api/session', 'DELETE', undefined, { Cookie: cookie });
  assert.equal(
    (await f.send('/api/library', 'GET', undefined, { Cookie: cookie })).status,
    401,
  );
});
