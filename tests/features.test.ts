import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createApp } from '../server/app.js';
import { Collection } from '../server/collection.js';
import type { MusicService } from '../server/ytdlp.js';
import type { LyricsService } from '../server/lyrics.js';
import {
  defaultSettings,
  EQ_PRESETS,
  normalizeSettings,
  presetFor,
} from '../shared/settings.js';
import { summarize } from '../shared/stats.js';
import type { PlayEvent, Stats, Track } from '../shared/types.js';

async function headers(options: { trustProxy?: boolean | number }) {
  const dataDir = await mkdtemp(join(tmpdir(), 'undertone-headers-'));
  const music: MusicService = {
    health: async () => ({ available: true, version: 'test', engine: 'yt-dlp' }),
    search: async () => ({ tracks: [], title: '' }),
    playlist: async () => ({ tracks: [], title: '' }),
    radio: async () => ({ tracks: [], title: '' }),
    track: async () => track,
    audio: async () => ({
      track,
      url: 'https://rr1-test.googlevideo.com/audio',
      headers: {},
      contentType: 'audio/webm',
    }),
  };
  const { app } = await createApp({
    dataDir,
    password: 'test-password',
    music,
    lyrics,
    ...options,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as { port: number };
  return {
    port,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

const track: Track = {
  id: 'abcdefghijk',
  source: 'youtube',
  title: 'Original test track',
  artist: 'Test artist',
  album: 'Test album',
  duration: 30,
  externalUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
};
const mixTrack: Track = {
  ...track,
  id: 'lmnopqrstuv',
  title: 'Mix continuation',
};
const lyrics: LyricsService = {
  lookup: async () => ({ lines: [], plain: '', origin: 'none' }),
  search: async () => [],
  get: async () => ({ lines: [], plain: '', origin: 'none' }),
};

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'undertone-features-'));
  const radioCalls: string[] = [];
  const music: MusicService = {
    health: async () => ({ available: true, version: 'test', engine: 'yt-dlp' }),
    search: async () => ({ tracks: [track], title: 'Test results' }),
    playlist: async () => ({ tracks: [track], title: 'Playlist' }),
    radio: async (id) => {
      radioCalls.push(id);
      return { tracks: [mixTrack], title: 'Radio mix' };
    },
    track: async (id) => ({ ...track, id }),
    audio: async (id) => ({
      track: { ...track, id },
      url: 'https://rr1-test.googlevideo.com/audio',
      headers: {},
      contentType: 'audio/webm',
    }),
  };
  const { app, collection } = await createApp({ dataDir, music, lyrics });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as { port: number };
  const send = (
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<{ status: number; json: () => Promise<any> }> =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const call = request(
        { host: '127.0.0.1', port, path, method, headers: {
          'X-Undertone': '1',
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
        } },
        (response) => {
          let text = '';
          response.on('data', (chunk) => (text += chunk));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              json: async () => JSON.parse(text),
            }),
          );
        },
      );
      call.on('error', reject);
      if (payload) call.write(payload);
      call.end();
    });
  return {
    send,
    collection,
    radioCalls,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

test('settings normalization clamps untrusted audio, theme and equalizer values', () => {
  const defaults = defaultSettings();
  assert.equal(defaults.crossfadeSeconds, 0);
  assert.equal(defaults.equalizer.enabled, false);
  const cleaned = normalizeSettings({
    audioFormat: 'flac',
    lyricsEnabled: false,
    radioEnabled: false,
    crossfadeSeconds: 900,
    playbackRate: 12,
    theme: 'neon',
    normalizeVolume: 'yes',
    equalizer: {
      enabled: true,
      preset: 'made-up',
      preamp: 99,
      bands: [50, -50, 'x', null, undefined, 3],
    },
  });
  assert.equal(cleaned.audioFormat, 'best');
  assert.equal(cleaned.lyricsEnabled, false);
  assert.equal(cleaned.radioEnabled, false);
  assert.equal(cleaned.crossfadeSeconds, 12);
  assert.equal(cleaned.playbackRate, 1);
  assert.equal(cleaned.theme, 'undertone');
  assert.equal(cleaned.normalizeVolume, false);
  assert.equal(cleaned.equalizer.preamp, 12);
  assert.equal(cleaned.equalizer.preset, 'custom');
  assert.deepEqual(cleaned.equalizer.bands, [12, -12, 0, 0, 0, 3, 0, 0, 0, 0]);
  assert.equal(presetFor(EQ_PRESETS.vocal), 'vocal');
  assert.equal(presetFor([1, 2, 3]), 'custom');
});

test('listening statistics rank by time and never invent entries', () => {
  const events: PlayEvent[] = [
    {
      id: 'a',
      title: 'First',
      artist: 'Artist one',
      album: 'A',
      playedAt: '2026-09-01T10:00:00.000Z',
      seconds: 100,
    },
    {
      id: 'b',
      title: 'Second',
      artist: 'Artist two',
      album: 'B',
      playedAt: '2026-09-02T10:00:00.000Z',
      seconds: 40,
    },
    {
      id: 'b',
      title: 'Second',
      artist: 'Artist two',
      album: 'B',
      playedAt: '2026-09-02T11:00:00.000Z',
      seconds: 40,
    },
  ];
  const stats = summarize(events);
  assert.equal(stats.plays, 3);
  assert.equal(stats.seconds, 180);
  assert.equal(stats.tracks, 2);
  assert.equal(stats.artists, 2);
  assert.equal(stats.days, 2);
  assert.equal(stats.topTracks[0].key, 'a');
  assert.equal(stats.topTracks[1].plays, 2);
  assert.equal(stats.recent[0].playedAt, '2026-09-02T11:00:00.000Z');
  assert.deepEqual(summarize([]).topArtists, []);
  assert.equal(summarize([]).plays, 0);
});

test('radio, history, statistics, player state and backups round-trip over HTTP', async (t) => {
  const f = await fixture();
  t.after(f.close);

  const radio = await f.send(`/api/tracks/${track.id}/radio`);
  assert.equal(radio.status, 200);
  assert.deepEqual(f.radioCalls, [track.id]);
  assert.equal((await radio.json()).tracks[0].id, mixTrack.id);

  assert.equal(
    (await f.send('/api/history', 'POST', { trackId: track.id, seconds: 5 }))
      .status,
    400,
  );
  assert.equal(
    (await f.send('/api/history', 'POST', { seconds: 60 })).status,
    400,
  );
  const recorded = await f.send('/api/history', 'POST', {
    trackId: track.id,
    seconds: 45,
  });
  assert.equal(recorded.status, 200);
  const stats: Stats = await recorded.json();
  assert.equal(stats.plays, 1);
  assert.equal(stats.seconds, 45);
  assert.equal(stats.topTracks[0].key, track.id);

  const saved = await f.send('/api/player', 'PUT', {
    queue: [track, { ...track, id: 'too-short' }, { ...track, id: 'has bad!' }],
    index: 9,
    position: 12.5,
    volume: 4,
    shuffle: true,
    repeat: 'nonsense',
  });
  const state = await saved.json();
  assert.equal(state.queue.length, 1, 'invalid video IDs are dropped');
  assert.equal(state.index, 0, 'index is clamped into the stored queue');
  assert.equal(state.volume, 1);
  assert.equal(state.repeat, 'off');
  assert.equal(state.position, 12.5);
  assert.equal((await (await f.send('/api/player')).json()).queue.length, 1);

  await f.send('/api/favorites', 'POST', { trackId: track.id });
  await f.send('/api/settings', 'PUT', {
    ...defaultSettings(),
    audioFormat: 'm4a',
    theme: 'tide',
    crossfadeSeconds: 6,
  });
  const backup = await (await f.send('/api/backup')).json();
  assert.equal(backup.application, 'undertone');
  assert.equal(backup.settings.theme, 'tide');
  assert.equal(backup.library.favorites[0], track.id);

  assert.equal((await f.send('/api/backup', 'POST', { nope: 1 })).status, 400);
  assert.equal(
    (
      await f.send('/api/backup', 'POST', {
        ...backup,
        library: { ...backup.library, tracks: [{ id: 'bad' }] },
      })
    ).status,
    400,
  );
  await f.send('/api/favorites/' + track.id, 'DELETE');
  assert.equal(f.collection.library.favorites.length, 0);
  const restored = await f.send('/api/backup', 'POST', backup);
  assert.equal(restored.status, 200);
  assert.equal(f.collection.library.favorites[0], track.id);
  assert.equal(f.collection.settings.crossfadeSeconds, 6);

  const cleared = await f.send('/api/history', 'DELETE');
  assert.equal((await cleared.json()).plays, 0);
});

test('radio and history obey their settings switches', async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.send('/api/settings', 'PUT', {
    ...defaultSettings(),
    radioEnabled: false,
    historyEnabled: false,
  });
  assert.equal((await f.send(`/api/tracks/${track.id}/radio`)).status, 403);
  assert.equal(
    (await f.send('/api/history', 'POST', { trackId: track.id, seconds: 60 }))
      .status,
    403,
  );
  assert.deepEqual(f.radioCalls, []);
});

test('collections keep history bounded and survive a restart', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'undertone-store-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const collection = new Collection(dataDir);
  await collection.init();
  await collection.savePlayer({
    queue: [track],
    index: 0,
    position: 7,
    volume: 0.5,
    shuffle: true,
    repeat: 'all',
  });
  for (let index = 0; index < 5; index++)
    await collection.record({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      playedAt: new Date(Date.now() + index).toISOString(),
      seconds: 30,
    });
  await collection.saveSettings({ ...defaultSettings(), theme: 'ember' });

  const reopened = new Collection(dataDir);
  await reopened.init();
  assert.equal(reopened.history.length, 5);
  assert.equal(reopened.player.position, 7);
  assert.equal(reopened.player.repeat, 'all');
  assert.ok(reopened.player.updatedAt);
  assert.equal(reopened.settings.theme, 'ember');
  assert.equal(reopened.stats().plays, 5);
  await reopened.clearHistory();
  assert.equal(reopened.stats().plays, 0);
});

test('responses carry a content policy and proxy headers only count when trusted', async (t) => {
  const direct = await headers({});
  t.after(direct.close);
  const response = await fetch(`http://127.0.0.1:${direct.port}/api/session`);
  const policy = response.headers.get('content-security-policy') ?? '';
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /img-src 'self' https:\/\/i\.ytimg\.com data:/);
  assert.doesNotMatch(policy, /unsafe-eval/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');

  const login = (forwarded: string) =>
    fetch(`http://127.0.0.1:${direct.port}/api/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Undertone': '1',
        'X-Forwarded-For': forwarded,
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({ password: 'wrong' }),
    });
  for (let attempt = 0; attempt < 10; attempt++)
    await login(`203.0.113.${attempt}`);
  assert.equal(
    (await login('203.0.113.200')).status,
    429,
    'an untrusted proxy header must not grant a fresh rate-limit bucket',
  );
  const untrusted = await fetch(`http://127.0.0.1:${direct.port}/api/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Undertone': '1',
      Origin: 'http://127.0.0.1:3000',
      'X-Forwarded-Proto': 'https',
    },
    body: JSON.stringify({ password: 'test-password' }),
  });
  assert.equal(untrusted.status, 429);

  const proxied = await headers({ trustProxy: 1 });
  t.after(proxied.close);
  const send = (forwarded: string, password: string) =>
    fetch(`http://127.0.0.1:${proxied.port}/api/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Undertone': '1',
        'X-Forwarded-For': forwarded,
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({ password }),
    });
  for (let attempt = 0; attempt < 10; attempt++)
    await send('203.0.113.9', 'wrong');
  assert.equal((await send('203.0.113.9', 'wrong')).status, 429);
  const other = await send('198.51.100.4', 'test-password');
  assert.equal(
    other.status,
    200,
    'a trusted proxy must rate limit each client separately',
  );
  assert.match(
    other.headers.get('set-cookie') ?? '',
    /Secure/,
    'a forwarded HTTPS request must receive a secure cookie',
  );
});
