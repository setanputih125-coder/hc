import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cookiesFile,
  extractorError,
  potEnabled,
  YtDlp,
} from '../server/ytdlp.js';
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
    'generated mixes are requested through their seed video, ordinary playlists directly',
    async () => {
      calls.length = 0;
      const mix = await service.playlist('RDabcdefghijk', 1);
      assert.equal(mix.tracks[0].id, entry.id);
      // YouTube refuses /playlist?list=RD…; only the watch URL serves a generated mix.
      assert.equal(
        calls[0].at(-1),
        'https://www.youtube.com/watch?v=abcdefghijk&list=RDabcdefghijk',
      );
      assert.ok(calls[0].includes('--yes-playlist'));
      assert.equal(calls[0][calls[0].indexOf('--playlist-start') + 1], '21');

      calls.length = 0;
      await service.playlist('PLabcdefghijklmnop', 0);
      assert.equal(
        calls[0].at(-1),
        'https://www.youtube.com/playlist?list=PLabcdefghijklmnop',
      );
      assert.ok(!calls[0].includes('--yes-playlist'));
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
      cookies: false,
      proofOfOrigin: false,
    });
  });
});

test('a cookies file is used only when configured and readable, and never inlined', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'undertone-cookies-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const jar = join(dir, 'cookies.txt');
  await writeFile(
    jar,
    '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t9999999999\tTEST\tnot-a-real-session\n',
  );
  const saved = process.env.MUSIC_COOKIES;
  t.after(() => {
    if (saved === undefined) delete process.env.MUSIC_COOKIES;
    else process.env.MUSIC_COOKIES = saved;
  });

  delete process.env.MUSIC_COOKIES;
  assert.equal(cookiesFile(), undefined);
  process.env.MUSIC_COOKIES = join(dir, 'missing.txt');
  assert.equal(cookiesFile(), undefined, 'a missing file must not be passed');
  process.env.MUSIC_COOKIES = dir;
  assert.equal(cookiesFile(), undefined, 'a directory is not a cookies file');

  process.env.MUSIC_COOKIES = jar;
  const calls: string[][] = [];
  const service = new YtDlp(async (args) => {
    calls.push(args);
    if (args.includes('--version')) return '2026.08.19';
    return JSON.stringify({ title: 'Test results', entries: [] });
  });
  await service.search('test', 0);
  const args = calls[0];
  assert.equal(args[args.indexOf('--cookies') + 1], jar);
  // The jar is referenced by path; its contents must never reach the argument list.
  assert.ok(!args.some((value) => value.includes('not-a-real-session')));
  assert.ok(args.includes('--no-plugin-dirs'), 'plugins stay off by default');
  assert.equal((await service.health()).cookies, true);

  assert.match(
    extractorError('Sign in to confirm you are not a bot').message,
    /saved sign-in/,
    'with cookies configured the advice must be to refresh them',
  );
  delete process.env.MUSIC_COOKIES;
  assert.match(
    extractorError('Sign in to confirm you are not a bot').message,
    /MUSIC_COOKIES/,
    'without cookies the advice must name the setting that helps',
  );
});

test('proof-of-origin support stays opt-in and only then enables plugins', async (t) => {
  const saved = process.env.MUSIC_ATTESTATION;
  t.after(() => {
    if (saved === undefined) delete process.env.MUSIC_ATTESTATION;
    else process.env.MUSIC_ATTESTATION = saved;
  });
  delete process.env.MUSIC_ATTESTATION;
  assert.equal(potEnabled(), false);
  process.env.MUSIC_ATTESTATION = 'yes';
  assert.equal(potEnabled(), false, 'only an explicit 1 turns plugins on');

  process.env.MUSIC_ATTESTATION = '1';
  const calls: string[][] = [];
  const service = new YtDlp(async (args) => {
    calls.push(args);
    if (args.includes('--version')) return '2026.08.19';
    return JSON.stringify({ title: 'Test results', entries: [] });
  });
  await service.search('test', 0);
  const args = calls[0];
  assert.ok(!args.includes('--no-plugin-dirs'), 'the provider plugin must load');
  assert.equal(
    args[args.indexOf('--extractor-args') + 1],
    'youtube:player_client=default,mweb',
  );
  // Remote component fetching stays off even when plugins are allowed.
  assert.ok(args.includes('--no-remote-components'));
  assert.equal((await service.health()).proofOfOrigin, true);
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
  await Promise.all([service.search('one', 30), service.search('two', 30)]);
  assert.equal(maximum, 1);
  const mismatch = await service.lookup({ ...track, duration: 250 });
  assert.equal(mismatch.matched, false);
  assert.equal(mismatch.lines.length, 0);
  assert.equal(mismatch.candidates?.length, 0);
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
  await assert.rejects(limited.search('one', 30), /rate-limiting/);
  await assert.rejects(limited.search('two', 30), /rate-limiting/);
  assert.equal(calls, 1);
  const offline = new LrcLib(async () => {
    throw new Error('offline');
  }, 0);
  await assert.rejects(offline.search('test', 30), /Your music can keep playing/);
  const missing = new LrcLib(
    async () => new Response('{}', { status: 404 }),
    0,
  );
  await assert.rejects(missing.get(123), /not found/);
});

test('lyrics search only returns the same displayed second, including fractional durations', async () => {
  let calls = 0;
  const durations = [
    180, 239, 239.999, 240, 240.99, 241, 360, 0, -1, null, '240',
  ];
  const service = new LrcLib(async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.pathname, '/api/search');
    assert.equal(url.searchParams.get('q'), 'Test artist Original test song');
    return new Response(
      JSON.stringify([
        ...durations.map((duration, id) => ({ ...record, id, duration })),
        { ...record, id: 99, duration: undefined },
      ]),
    );
  }, 0);
  const query = 'Test artist Original test song';
  assert.deepEqual(
    (await service.search(query, 240)).map((r) => r.duration),
    [240, 240.99],
  );
  assert.deepEqual(
    (await service.search(query, 240.999)).map((r) => r.duration),
    [240, 240.99],
  );
  assert.deepEqual(
    (await service.search(query, 239)).map((r) => r.duration),
    [239, 239.999],
  );
  assert.deepEqual(
    (await service.search(query, 241)).map((r) => r.duration),
    [241],
  );
  assert.deepEqual(await service.search(query, 250), []);
  assert.equal(calls, 1);
});

test('automatic lyrics reject a nearby exact-endpoint duration and filter fallback candidates before matching', async () => {
  const paths: string[] = [];
  const service = new LrcLib(async (input) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    return new Response(
      JSON.stringify(
        path === '/api/get'
          ? { ...record, duration: 241 }
          : [
              { ...record, id: 1, duration: 241 },
              { ...record, id: 2, duration: 240.5 },
              { ...record, id: 3, duration: 239.99 },
              { ...record, id: 4, duration: null },
            ],
      ),
    );
  }, 0);
  const result = await service.lookup({ ...track, duration: 240 });
  assert.equal(result.matched, true);
  assert.equal(result.recordId, 2);
  assert.deepEqual(result.candidates?.map((r) => r.id), [2]);
  assert.deepEqual(paths, ['/api/get', '/api/search']);
});

test('duration-matched candidates still require matching metadata and an unambiguous recording', async () => {
  const service = new LrcLib(
    async () => new Response(JSON.stringify([
      { ...record, id: 1, duration: 240 },
      { ...record, id: 2, duration: 240.5 },
      { ...record, id: 3, duration: 241 },
    ])),
    0,
  );
  for (const lyricsArtist of [track.lyricsArtist, 'Other artist', undefined]) {
    const result = await service.lookup({
      ...track,
      album: 'YouTube',
      duration: 240,
      lyricsArtist,
    });
    assert.equal(result.matched, false);
    assert.equal(result.lines.length, 0);
    assert.deepEqual(result.candidates?.map((r) => r.id), [1, 2]);
  }
});

test('unknown or invalid track durations never trigger an unfiltered provider search', async () => {
  let calls = 0;
  const service = new LrcLib(async () => {
    calls++;
    return new Response(JSON.stringify([record]));
  }, 0);
  for (const duration of [0, -1, NaN, Infinity, -Infinity]) {
    await assert.rejects(
      service.search('Test song', duration),
      /valid track duration/,
    );
    const result = await service.lookup({ ...track, duration });
    assert.equal(result.matched, false);
    assert.deepEqual(result.candidates, []);
  }
  assert.equal(calls, 0);
});
