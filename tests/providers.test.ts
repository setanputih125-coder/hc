import test from 'node:test';
import assert from 'node:assert/strict';
import { YtDlp } from '../server/ytdlp.js';
import { LrcLib } from '../server/lyrics.js';
import type { Track } from '../shared/types.js';

const entry = {
  id: 'abcdefghijk',
  title: 'Test artist - Original test song',
  track: 'Original test song',
  artist: 'Test artist',
  album: 'Test album',
  duration: 30,
};

test('yt-dlp arguments, caching, metadata, headers and input restrictions', async (t) => {
  const calls: string[][] = [];
  const service = new YtDlp(async (args) => {
    calls.push(args);
    if (args.includes('--version')) return '2026.08.19';
    if (args.includes('--flat-playlist'))
      return JSON.stringify({ title: 'Test results', entries: [entry] });
    return JSON.stringify({
      ...entry,
      url: 'https://rr1-test.googlevideo.com/audio?expire=9999999999',
      ext: 'webm',
      acodec: 'opus',
      vcodec: 'none',
      protocol: 'https',
      http_headers: {
        'User-Agent': 'Expected agent',
        Cookie: 'must-not-forward',
        Referer: 'https://www.youtube.com/',
        'X-Unsafe': 'discard',
      },
    });
  });
  await t.test(
    'search values remain one argument, with safe configuration and bounded paging',
    async () => {
      const query = 'music; touch /tmp/not-executed';
      const results = await Promise.all([
        service.search(query, 1),
        service.search(query, 1),
      ]);
      assert.equal(calls.length, 1);
      assert.equal(results[0].tracks[0].id, entry.id);
      assert.equal(calls[0].at(-1), `ytsearch40:${query}`);
      assert.equal(calls[0].at(-2), '--');
      for (const option of [
        '--ignore-config',
        '--no-plugin-dirs',
        '--no-remote-components',
        '--flat-playlist',
        '--skip-download',
      ])
        assert.ok(calls[0].includes(option));
      assert.equal(calls[0][calls[0].indexOf('--playlist-start') + 1], '21');
      await assert.rejects(service.search('test', 10), /page/);
      await assert.rejects(service.playlist('../../etc/passwd', 0), /Invalid/);
      await assert.rejects(service.audio('invalid', 'best'), /Invalid/);
    },
  );
  await t.test(
    'direct audio URLs stay server-side and cookie or unknown headers are dropped',
    async () => {
      const resolved = await service.audio(entry.id, 'best');
      assert.equal(resolved.contentType, 'audio/webm');
      assert.equal(resolved.headers['User-Agent'], 'Expected agent');
      assert.equal(resolved.headers.Cookie, undefined);
      assert.equal(resolved.headers['X-Unsafe'], undefined);
      const count = calls.length;
      await service.audio(entry.id, 'best');
      assert.equal(calls.length, count);
      await service.audio(entry.id, 'best', true);
      assert.equal(calls.length, count + 1);
      await service.audio(entry.id, 'm4a');
      const args = calls.at(-1)!;
      assert.equal(
        args[args.indexOf('--format') + 1],
        'bestaudio[ext=m4a][protocol=https]',
      );
    },
  );
  await t.test('health reports the actual executable version', async () => {
    assert.deepEqual(await service.health(), {
      engine: 'yt-dlp',
      available: true,
      version: '2026.08.19',
    });
  });
});

test('flat search metadata cannot replace the resolved recording used for lyric matching', async () => {
  const service = new YtDlp(async (args) => {
    if (args.includes('--flat-playlist'))
      return JSON.stringify({
        entries: [{ id: entry.id, title: 'Channel upload', duration: 29 }],
      });
    return JSON.stringify({
      ...entry,
      url: 'https://rr1-test.googlevideo.com/audio',
      ext: 'webm',
      vcodec: 'none',
    });
  });
  const resolved = await service.audio(entry.id, 'best');
  await service.search('a new query', 0);
  assert.deepEqual(await service.track(entry.id), resolved.track);
  assert.equal((await service.track(entry.id)).lyricsArtist, entry.artist);
  assert.equal((await service.track(entry.id)).duration, entry.duration);
});

const record = {
  id: 12,
  trackName: 'Original test song',
  artistName: 'Test artist',
  albumName: 'Test album',
  duration: 30,
  instrumental: false,
  syncedLyrics: '[00:00.00]Original test line\n[00:05.00]Another original line',
  plainLyrics: 'Original test line\nAnother original line',
};
const track: Track = {
  id: entry.id,
  source: 'youtube',
  title: entry.track,
  artist: entry.artist,
  album: entry.album,
  duration: 30,
  lyricsArtist: entry.artist,
  lyricsTitle: entry.track,
  externalUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
};

test('LRCLIB identifies the client, searches sequentially, caches, and matches conservatively', async () => {
  let calls = 0;
  let active = 0;
  let maximum = 0;
  const service = new LrcLib(async (input, init) => {
    calls++;
    active++;
    maximum = Math.max(active, maximum);
    assert.equal(new URL(String(input)).origin, 'https://lrclib.net');
    assert.match(
      new Headers(init?.headers).get('User-Agent')!,
      /Undertone\/1.0/,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return new Response(
      JSON.stringify(
        new URL(String(input)).pathname === '/api/get' ? record : [record],
      ),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }, 1);
  const matched = await service.lookup(track);
  assert.equal(matched.matched, true);
  assert.equal(matched.lines[1].time, 5);
  assert.equal(matched.origin, 'lrclib');
  assert.equal(matched.record?.duration, record.duration);
  assert.equal(matched.record?.album, record.albumName);
  assert.equal((await service.get(record.id)).record?.id, record.id);
  assert.equal((await service.get(record.id)).plain, record.plainLyrics);
  assert.equal(calls, 1);
  await Promise.all([service.search('one'), service.search('two')]);
  assert.equal(maximum, 1);
  const mismatch = await service.lookup({ ...track, duration: 250 });
  assert.equal(mismatch.matched, false);
  assert.equal(mismatch.lines.length, 0);
  assert.equal(mismatch.candidates?.length, 1);
});

test('plain and instrumental records stay untimed and explicit', async () => {
  const plain = new LrcLib(
    async () => new Response(JSON.stringify({ ...record, syncedLyrics: null })),
    0,
  );
  assert.equal((await plain.get(12)).lines.length, 0);
  assert.equal((await plain.get(12)).plain, record.plainLyrics);
  const instrumental = new LrcLib(
    async () =>
      new Response(
        JSON.stringify({
          ...record,
          syncedLyrics: null,
          plainLyrics: null,
          instrumental: true,
        }),
      ),
    0,
  );
  assert.equal((await instrumental.get(12)).instrumental, true);
  assert.equal((await instrumental.get(12)).plain, '');
});

test('missing exact lyric signatures fall back to structured search rather than a fabricated result', async () => {
  const paths: string[] = [];
  const service = new LrcLib(async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname === '/api/get') {
      assert.equal(url.searchParams.get('album_name'), track.album);
      assert.equal(url.searchParams.get('duration'), '30');
      return new Response('{}', { status: 404 });
    }
    assert.equal(url.searchParams.get('artist_name'), track.lyricsArtist);
    return new Response(JSON.stringify([record]));
  }, 0);
  assert.equal((await service.lookup(track)).matched, true);
  assert.deepEqual(paths, ['/api/get', '/api/search']);
});

test('LRCLIB Retry-After is honored across all requests without automatic retry loops', async () => {
  let calls = 0;
  const limited = new LrcLib(async () => {
    calls++;
    return new Response('{}', {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }, 0);
  await assert.rejects(limited.search('one'), /rate-limiting/);
  await assert.rejects(limited.search('two'), /rate-limiting/);
  assert.equal(calls, 1);
  const offline = new LrcLib(async () => {
    throw new Error('offline');
  }, 0);
  await assert.rejects(offline.search('test'), /Your music can keep playing/);
  const missing = new LrcLib(
    async () => new Response('{}', { status: 404 }),
    0,
  );
  await assert.rejects(missing.get(123), /not found/);
});
