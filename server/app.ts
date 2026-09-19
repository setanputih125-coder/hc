import express, { type ErrorRequestHandler } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve, sep } from 'node:path';
import { Collection } from './collection.js';
import { LrcLib, type LyricsService } from './lyrics.js';
import {
  mediaUrl,
  ServiceError,
  validVideo,
  YtDlp,
  type MusicService,
} from './ytdlp.js';
import type { Settings } from '../shared/types.js';
import { normalizeSettings } from '../shared/settings.js';
import { MIN_PLAY_SECONDS } from '../shared/stats.js';
import type { Backup, PlayerState, Track } from '../shared/types.js';

export interface AppOptions {
  dataDir: string;
  password?: string;
  origins?: string[];
  clientDir?: string;
  trustProxy?: boolean | number | string;
  music?: MusicService;
  lyrics?: LyricsService;
  fetcher?: typeof fetch;
}

function lyricsDuration(value: unknown) {
  const duration = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new ServiceError(
      'A valid track duration is required to find lyrics.',
      400,
    );
  return duration;
}

export async function createApp(options: AppOptions) {
  const collection = new Collection(resolve(options.dataDir));
  await collection.init();
  const music = options.music ?? new YtDlp();
  const lyrics = options.lyrics ?? new LrcLib();
  const fetcher = options.fetcher ?? fetch;
  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy !== undefined)
    app.set('trust proxy', options.trustProxy);
  const sessions = new Map<string, number>();
  const attempts = new Map<string, { count: number; expires: number }>();
  const origins = new Set(
    options.origins ?? [
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ],
  );
  const hosts = new Set([...origins].map((origin) => new URL(origin).hostname));
  const digest = (value: string) => createHash('sha256').update(value).digest();
  app.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
  });
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' https://i.ytimg.com data:; media-src 'self' blob:; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'self'; object-src 'none'",
    });
    if (!hosts.has(req.hostname)) {
      res
        .status(403)
        .json({
          error: 'Host not allowed. Configure PUBLIC_ORIGIN for this address.',
        });
      return;
    }
    if (req.path.startsWith('/api')) {
      res.set('Cache-Control', 'no-store');
      if (
        req.get('sec-fetch-site') === 'cross-site' ||
        (req.get('origin') && !origins.has(req.get('origin')!))
      ) {
        res
          .status(403)
          .json({ error: 'This request must come from your Undertone app.' });
        return;
      }
    }
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.get('X-Undertone') !== '1'
    ) {
      res
        .status(403)
        .json({ error: 'This request must come from your Undertone app.' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  const authenticated = (cookie = '') => {
    if (!options.password) return true;
    const token = cookie
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('undertone_session='))
      ?.slice(18);
    return !!token && (sessions.get(token) ?? 0) > Date.now();
  };
  app.get('/api/session', (req, res) =>
    res.json({ authenticated: authenticated(req.headers.cookie) }),
  );
  app.post('/api/session', (req, res) => {
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.expires < now) attempts.delete(key);
    for (const [key, expiry] of sessions)
      if (expiry < now) sessions.delete(key);
    if (attempts.size > 1000 || sessions.size > 1000) {
      res.status(503).json({ error: 'The server is busy. Try later.' });
      return;
    }
    const ip = req.ip ?? 'unknown';
    const attempt = attempts.get(ip) ?? { count: 0, expires: now + 60_000 };
    if (attempt.count >= 10) {
      res
        .status(429)
        .json({ error: 'Too many login attempts. Wait one minute.' });
      return;
    }
    attempt.count++;
    attempts.set(ip, attempt);
    if (
      options.password &&
      (typeof req.body?.password !== 'string' ||
        !timingSafeEqual(digest(req.body.password), digest(options.password)))
    ) {
      res.status(401).json({ error: 'That server password is not correct.' });
      return;
    }
    attempts.delete(ip);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, now + 86_400_000);
    res
      .cookie('undertone_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: req.secure || !!req.get('origin')?.startsWith('https:'),
        maxAge: 86_400_000,
        path: '/',
      })
      .json({ authenticated: true });
  });
  app.delete('/api/session', (req, res) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('undertone_session='))
      ?.slice(18);
    if (token) sessions.delete(token);
    res
      .clearCookie('undertone_session', { path: '/' })
      .json({ authenticated: !options.password });
  });
  app.use('/api', (req, res, next) => {
    if (!authenticated(req.headers.cookie)) {
      res.status(401).json({ error: 'Unlock this server to continue.' });
      return;
    }
    next();
  });
  app.get('/api/health', async (_req, res) => res.json(await music.health()));
  app.get('/api/settings', (_req, res) => res.json(collection.settings));
  app.put('/api/settings', async (req, res) => {
    if (!['best', 'm4a'].includes(req.body?.audioFormat))
      throw new ServiceError(
        'Choose best or m4a audio and an online lyrics preference.',
        400,
      );
    const settings: Settings = normalizeSettings(req.body);
    res.json(await collection.saveSettings(settings));
  });
  app.get('/api/search', async (req, res) =>
    res.json(
      await music.search(
        String(req.query.q ?? ''),
        Number(req.query.page ?? 0),
      ),
    ),
  );
  app.get('/api/youtube/playlists/:id', async (req, res) =>
    res.json(await music.playlist(req.params.id, Number(req.query.page ?? 0))),
  );
  app.get('/api/tracks/:id/radio', async (req, res) => {
    if (!collection.settings.radioEnabled)
      throw new ServiceError('Radio is turned off in Settings.', 403);
    res.json(await music.radio(req.params.id));
  });
  app.get('/api/tracks/:id', async (req, res) =>
    res.json(await music.track(req.params.id)),
  );
  app.get('/api/tracks/:id/resolve', async (req, res) => {
    const resolved = await music.audio(
      req.params.id,
      collection.settings.audioFormat,
    );
    res.json(resolved.track);
  });
  let streams = 0;
  app.get('/api/tracks/:id/stream', async (req, res, next) => {
    if (!validVideo(req.params.id))
      throw new ServiceError('Invalid YouTube video ID.', 400);
    if (streams >= 4)
      throw new ServiceError(
        'Four streams are already active. Stop another player and retry.',
        503,
      );
    const range = req.get('range');
    if (
      range &&
      !range.includes(',') &&
      !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)
    )
      throw new ServiceError('Invalid byte range.', 400);
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.on('close', abort);
    streams++;
    try {
      const requestedRange = range?.includes(',') ? undefined : range;
      let response: Response | undefined;
      let contentType = 'application/octet-stream';
      for (let attempt = 0; attempt < 2; attempt++) {
        const resolved = await music.audio(
          req.params.id,
          collection.settings.audioFormat,
          attempt > 0,
        );
        if (controller.signal.aborted) return;
        contentType = resolved.contentType;
        const headers = new Headers(resolved.headers);
        headers.set('Accept-Encoding', 'identity');
        if (requestedRange || req.method === 'HEAD')
          headers.set('Range', requestedRange || 'bytes=0-0');
        if (req.get('if-range')) headers.set('If-Range', req.get('if-range')!);
        let url = mediaUrl(resolved.url);
        const timer = setTimeout(abort, 20_000);
        try {
          for (let redirects = 0; redirects <= 3; redirects++) {
            response = await fetcher(url, {
              method: 'GET',
              headers,
              redirect: 'manual',
              signal: controller.signal,
            });
            if (![301, 302, 303, 307, 308].includes(response.status)) break;
            const location = response.headers.get('location');
            await response.body?.cancel();
            if (!location || redirects === 3)
              throw new ServiceError(
                'Audio redirect failed. Retry this track.',
              );
            url = mediaUrl(new URL(location, url).href);
          }
        } finally {
          clearTimeout(timer);
        }
        if (![403, 410].includes(response!.status)) break;
        await response!.body?.cancel();
      }
      if (!response)
        throw new ServiceError('The audio server did not respond.');
      if (response.status === 416) {
        res.status(416);
        const contentRange = response.headers.get('content-range');
        if (contentRange) res.set('Content-Range', contentRange);
        await response.body?.cancel();
        res.end();
        return;
      }
      if (![200, 206].includes(response.status)) {
        await response.body?.cancel();
        throw new ServiceError(
          `YouTube audio is unavailable (${response.status}). Retry or choose another track.`,
        );
      }
      res.status(response.status).set('Content-Type', contentType);
      for (const header of [
        'content-length',
        'content-range',
        'accept-ranges',
        'etag',
        'last-modified',
      ]) {
        const value = response.headers.get(header);
        if (value) res.set(header, value);
      }
      if (response.status === 206) res.set('Accept-Ranges', 'bytes');
      if (req.method === 'HEAD') {
        if (!requestedRange && response.status === 206) {
          const total = response.headers
            .get('content-range')
            ?.match(/\/(\d+)$/)?.[1];
          if (total) res.set('Content-Length', total);
          else res.removeHeader('Content-Length');
          res.removeHeader('Content-Range');
          res.status(200);
        }
        await response.body?.cancel();
        res.end();
        return;
      }
      if (!response.body)
        throw new ServiceError('The audio server returned an empty stream.');
      res.setTimeout(60_000, abort);
      await pipeline(
        Readable.fromWeb(
          response.body as import('node:stream/web').ReadableStream,
        ),
        res,
        { signal: controller.signal },
      );
    } catch (error) {
      if (!controller.signal.aborted && !res.headersSent)
        next(
          error instanceof ServiceError
            ? error
            : new ServiceError(
                'Audio streaming failed. Check your network and retry.',
              ),
        );
      else if (!res.writableEnded) res.destroy();
    } finally {
      streams--;
      res.off('close', abort);
    }
  });
  app.get('/api/library', (_req, res) => res.json(collection.library));
  app.get('/api/player', (_req, res) => res.json(collection.player));
  app.put('/api/player', async (req, res) => {
    const body = req.body ?? {};
    const queue: Track[] = Array.isArray(body.queue)
      ? body.queue
          .filter(
            (track: Track) =>
              track && validVideo(track.id) && typeof track.title === 'string',
          )
          .slice(0, 1000)
      : [];
    const state: PlayerState = {
      queue,
      index: Math.max(
        0,
        Math.min(queue.length - 1, Math.trunc(Number(body.index) || 0)),
      ),
      position: Math.max(0, Number(body.position) || 0),
      volume: Math.max(0, Math.min(1, Number(body.volume ?? 0.7))),
      shuffle: body.shuffle === true,
      repeat: ['off', 'all', 'one'].includes(body.repeat) ? body.repeat : 'off',
    };
    res.json(await collection.savePlayer(state));
  });
  app.get('/api/stats', (req, res) => {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    res.json(collection.stats(limit));
  });
  app.post('/api/history', async (req, res) => {
    if (!collection.settings.historyEnabled)
      throw new ServiceError('Listening history is turned off.', 403);
    const seconds = Number(req.body?.seconds);
    if (
      typeof req.body?.trackId !== 'string' ||
      !Number.isFinite(seconds) ||
      seconds < MIN_PLAY_SECONDS
    )
      throw new ServiceError(
        `Provide a track ID and at least ${MIN_PLAY_SECONDS} listened seconds.`,
        400,
      );
    const track = await music.track(req.body.trackId);
    await collection.record({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.artwork,
      playedAt: new Date().toISOString(),
      seconds: Math.min(Math.round(seconds), 24 * 3600),
    });
    res.json(collection.stats());
  });
  app.delete('/api/history', async (_req, res) => {
    await collection.clearHistory();
    res.json(collection.stats());
  });
  app.get('/api/backup', (_req, res) =>
    res
      .set(
        'Content-Disposition',
        `attachment; filename="undertone-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      )
      .json(collection.export()),
  );
  app.post('/api/backup', async (req, res) => {
    const backup = req.body as Backup;
    if (
      backup?.application !== 'undertone' ||
      backup.version !== 1 ||
      !backup.library ||
      !Array.isArray(backup.library.tracks) ||
      !Array.isArray(backup.library.favorites) ||
      !Array.isArray(backup.library.playlists) ||
      backup.library.tracks.some(
        (track) => !track || !validVideo(track.id ?? ''),
      )
    )
      throw new ServiceError('This is not a valid Undertone backup file.', 400);
    res.json(await collection.import(backup));
  });
  app.post('/api/favorites', async (req, res) => {
    if (typeof req.body?.trackId !== 'string')
      throw new ServiceError('Provide a track ID.', 400);
    await collection.favorite(await music.track(req.body.trackId));
    res.json(collection.library);
  });
  app.delete('/api/favorites/:id', async (req, res) => {
    await collection.unfavorite(req.params.id);
    res.json(collection.library);
  });
  const playlistName = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 100)
      throw new ServiceError('Playlist names must have 1–100 characters.', 400);
    return value.trim();
  };
  app.post('/api/playlists', async (req, res) =>
    res.status(201).json(await collection.create(playlistName(req.body?.name))),
  );
  app.put('/api/playlists/:id', async (req, res) => {
    const { name, trackIds } = req.body ?? {};
    if (name === undefined && trackIds === undefined)
      throw new ServiceError(
        'Provide a playlist name or ordered track IDs.',
        400,
      );
    if (
      trackIds !== undefined &&
      (!Array.isArray(trackIds) ||
        trackIds.length > 1000 ||
        !trackIds.every((id) => typeof id === 'string' && validVideo(id)))
    )
      throw new ServiceError('Use at most 1,000 valid track IDs.', 400);
    res.json(
      await collection.update(
        req.params.id,
        name === undefined ? undefined : playlistName(name),
        trackIds,
      ),
    );
  });
  app.post('/api/playlists/:id/tracks', async (req, res) => {
    if (typeof req.body?.trackId !== 'string')
      throw new ServiceError('Provide a track ID.', 400);
    res.json(
      await collection.update(
        req.params.id,
        undefined,
        undefined,
        await music.track(req.body.trackId),
      ),
    );
  });
  app.delete('/api/playlists/:id', async (req, res) => {
    await collection.delete(req.params.id);
    res.json({ ok: true });
  });
  app.get('/api/lyrics/search', async (req, res) => {
    if (!collection.settings.lyricsEnabled)
      throw new ServiceError('Online lyrics are disabled in Settings.', 403);
    const query = String(req.query.q ?? '').trim();
    if (!query || query.length > 200)
      throw new ServiceError('Use a lyrics search of 1–200 characters.', 400);
    res.json(await lyrics.search(query, lyricsDuration(req.query.duration)));
  });
  app.get('/api/lyrics/:id', async (req, res) => {
    if (!collection.settings.lyricsEnabled)
      throw new ServiceError('Online lyrics are disabled in Settings.', 403);
    if (!/^\d{1,12}$/.test(req.params.id))
      throw new ServiceError('Invalid lyrics record ID.', 400);
    res.json(await lyrics.get(Number(req.params.id)));
  });
  app.get('/api/tracks/:id/lyrics', async (req, res) => {
    if (!collection.settings.lyricsEnabled)
      throw new ServiceError('Online lyrics are disabled in Settings.', 403);
    const duration =
      Object.keys(req.query).length === 0
        ? undefined
        : lyricsDuration(req.query.duration);
    const track = await music.track(req.params.id);
    res.json(
      await lyrics.lookup({ ...track, duration: duration ?? track.duration }),
    );
  });
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: 'Unknown API endpoint.' }),
  );
  if (options.clientDir) {
    app.use(
      express.static(options.clientDir, {
        setHeaders: (response, path) =>
          response.set(
            'Cache-Control',
            // Vite emits content-hashed files under /assets, everything else must revalidate.
            path.includes(`${sep}assets${sep}`)
              ? 'public, max-age=31536000, immutable'
              : 'no-cache',
          ),
      }),
    );
    app.get('/{*path}', (_req, res) =>
      res
        .set('Cache-Control', 'no-cache')
        .sendFile(resolve(options.clientDir!, 'index.html')),
    );
  }
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status =
      error instanceof ServiceError
        ? error.status
        : error.type === 'entity.parse.failed'
          ? 400
          : 500;
    res
      .status(status)
      .json({
        error:
          error instanceof ServiceError
            ? error.message
            : status === 400
              ? 'Invalid JSON request.'
              : 'The server could not complete this request. Check server storage and try again.',
      });
  };
  app.use(errors);
  return { app, collection, music, lyrics };
}
