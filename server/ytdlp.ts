import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CatalogPage, Health, Settings, Track } from '../shared/types.js';

export class ServiceError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export interface Extracted {
  id?: string;
  title?: string;
  track?: string;
  artist?: string;
  album?: string;
  channel?: string;
  uploader?: string;
  duration?: number;
  entries?: (Extracted | null)[];
  url?: string;
  ext?: string;
  abr?: number;
  acodec?: string;
  vcodec?: string;
  protocol?: string;
  http_headers?: Record<string, string>;
  is_live?: boolean;
  live_status?: string;
  availability?: string;
}

export interface ResolvedAudio {
  track: Track;
  url: string;
  headers: Record<string, string>;
  contentType: string;
}
export interface MusicService {
  health(): Promise<Health>;
  search(query: string, page: number): Promise<CatalogPage>;
  playlist(id: string, page: number): Promise<CatalogPage>;
  track(id: string): Promise<Track>;
  audio(
    id: string,
    format: Settings['audioFormat'],
    refresh?: boolean,
  ): Promise<ResolvedAudio>;
}

export function validVideo(id: string) {
  return /^[\w-]{11}$/.test(id);
}
export function mediaUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.googlevideo.com') ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new ServiceError('The extractor returned an unsupported audio host.');
  return url;
}

function cleanTitle(value: string) {
  return value
    .replace(
      /\s*[\[(](?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?|visuali[sz]er|hd|4k)[\])]/gi,
      '',
    )
    .trim();
}

export function normalizeTrack(info: Extracted): Track | undefined {
  if (
    !info.id ||
    !validVideo(info.id) ||
    !info.title ||
    ['private', 'premium_only', 'subscriber_only', 'needs_auth'].includes(
      info.availability ?? '',
    ) ||
    info.is_live ||
    ['is_live', 'is_upcoming'].includes(info.live_status ?? '')
  )
    return undefined;
  const title = info.track || cleanTitle(info.title);
  const split = /^(.{1,100}?)\s+[-–—]\s+(.{1,200})$/.exec(title);
  return {
    id: info.id,
    source: 'youtube',
    title,
    artist: info.artist || info.channel || info.uploader || 'YouTube',
    album: info.album || 'YouTube',
    duration: Number.isFinite(info.duration) ? Math.max(0, info.duration!) : 0,
    artwork: `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
    externalUrl: `https://www.youtube.com/watch?v=${info.id}`,
    lyricsArtist: info.artist || split?.[1],
    lyricsTitle: info.track || split?.[2] || title,
    ...(info.ext ? { format: info.ext.toUpperCase(), bitrate: info.abr } : {}),
  };
}

export function extractorError(stderr: string): ServiceError {
  if (/No module named|ENOENT/i.test(stderr))
    return new ServiceError(
      'The music service is unavailable. Run the server setup script to install its audio dependencies.',
      503,
    );
  if (/sign in|not a bot|login required|confirm your age|cookies/i.test(stderr))
    return new ServiceError(
      'YouTube requires verification or login from this server. This client does not import cookies or bypass account restrictions. Try a public video from another network.',
      503,
    );
  if (/requested format|no video formats|only images/i.test(stderr))
    return new ServiceError(
      'No compatible direct audio stream is available. Try another track or switch audio format in Settings.',
    );
  if (
    /private video|removed|not available|unavailable|members.only|premium/i.test(
      stderr,
    )
  )
    return new ServiceError(
      'This video is unavailable, private, restricted, or removed.',
      404,
    );
  if (/429|too many requests/i.test(stderr))
    return new ServiceError(
      'YouTube is rate-limiting this server. Wait before trying again.',
      429,
    );
  return new ServiceError(
    'Could not load this music. Check your server connection, update its audio dependencies, then retry.',
  );
}

export class YtDlp implements MusicService {
  private active = 0;
  private waiting: (() => void)[] = [];
  private cache = new Map<string, { expires: number; value: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();
  private metadata = new Map<string, { track: Track; detailed: boolean }>();
  constructor(private runner?: (args: string[]) => Promise<string>) {}

  private async run(args: string[]) {
    if (this.active >= 2) {
      if (this.waiting.length >= 12)
        throw new ServiceError(
          'The music server is busy. Try again shortly.',
          503,
        );
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else this.active++;
    try {
      if (this.runner) return await this.runner(args);
      return await new Promise<string>((resolvePromise, reject) => {
        const python =
          process.env.PYTHON_BIN ||
          (existsSync('.venv/bin/python')
            ? resolve('.venv/bin/python')
            : 'python3');
        const detached = process.platform !== 'win32';
        const child = spawn(python, ['-m', 'yt_dlp', ...args], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached,
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const stop = () => {
          try {
            if (detached && child.pid) process.kill(-child.pid, 'SIGKILL');
            else child.kill('SIGKILL');
          } catch {}
        };
        const timer = setTimeout(() => {
          stop();
          done(
            new ServiceError(
              'YouTube extraction timed out after 60 seconds. Try again or check the server network.',
              504,
            ),
          );
        }, 60_000);
        const done = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolvePromise(stdout);
        };
        child.stdout.on('data', (chunk) => {
          stdout += chunk;
          if (stdout.length > 8_000_000) {
            stop();
            done(
              new ServiceError(
                'YouTube returned too much metadata. Use a smaller request.',
              ),
            );
          }
        });
        child.stderr.on('data', (chunk) => {
          stderr = (stderr + chunk).slice(-8000);
        });
        child.on('error', () => done(extractorError('ENOENT')));
        child.on('close', (code) =>
          done(code === 0 ? undefined : extractorError(stderr)),
        );
      });
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }

  private async cached<T>(
    key: string,
    task: () => Promise<T>,
    ttl = 180_000,
  ): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;
    const inflight = this.inflight.get(key);
    if (inflight) return inflight as Promise<T>;
    const promise = task()
      .then((value) => {
        if (this.cache.size >= 150)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { expires: Date.now() + ttl, value });
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private async extract(target: string, args: string[]): Promise<Extracted> {
    const raw = await this.run([
      '--ignore-config',
      '--no-plugin-dirs',
      '--no-remote-components',
      '--no-cache-dir',
      '--js-runtimes',
      `node:${process.execPath}`,
      '--socket-timeout',
      '15',
      '--retries',
      '1',
      '--extractor-retries',
      '1',
      '--no-warnings',
      '--no-progress',
      '--skip-download',
      '--dump-single-json',
      ...args,
      '--',
      target,
    ]);
    try {
      return JSON.parse(raw) as Extracted;
    } catch {
      throw new ServiceError(
        'yt-dlp returned invalid metadata. Update its pinned version and retry.',
      );
    }
  }

  private remember(info: Extracted, detailed = false) {
    const cached = info.id ? this.metadata.get(info.id) : undefined;
    if (cached?.detailed && !detailed) return cached.track;
    const track = normalizeTrack(info);
    if (track) {
      if (this.metadata.size >= 1000)
        this.metadata.delete(this.metadata.keys().next().value!);
      this.metadata.set(track.id, { track, detailed });
    }
    return track;
  }

  async health(): Promise<Health> {
    return this.cached(
      'health',
      async () => {
        try {
          const version = (
            await this.run(['--ignore-config', '--version'])
          ).trim();
          return { available: true, engine: 'yt-dlp' as const, version };
        } catch (error) {
          return {
            available: false,
            engine: 'yt-dlp' as const,
            message: (error as Error).message,
          };
        }
      },
      30_000,
    );
  }

  async search(query: string, page = 0): Promise<CatalogPage> {
    if (
      !query.trim() ||
      query.length > 200 ||
      !Number.isInteger(page) ||
      page < 0 ||
      page > 9
    )
      throw new ServiceError(
        'Use a search of 1–200 characters and a page between 0 and 9.',
        400,
      );
    return this.cached(`search:${query}:${page}`, async () => {
      const info = await this.extract(`ytsearch${(page + 1) * 20}:${query}`, [
        '--flat-playlist',
        '--playlist-start',
        String(page * 20 + 1),
        '--playlist-end',
        String((page + 1) * 20),
      ]);
      const tracks = (info.entries ?? [])
        .filter((entry): entry is Extracted => !!entry)
        .map((entry) => this.remember(entry))
        .filter((track): track is Track => !!track);
      return {
        tracks,
        title: query,
        nextPage:
          info.entries?.length === 20 && page < 9 ? page + 1 : undefined,
      };
    });
  }

  async playlist(id: string, page = 0): Promise<CatalogPage> {
    if (
      !/^[\w-]{10,100}$/.test(id) ||
      !Number.isInteger(page) ||
      page < 0 ||
      page > 49
    )
      throw new ServiceError('Invalid YouTube playlist or page.', 400);
    return this.cached(`playlist:${id}:${page}`, async () => {
      const info = await this.extract(
        `https://www.youtube.com/playlist?list=${id}`,
        [
          '--flat-playlist',
          '--playlist-start',
          String(page * 20 + 1),
          '--playlist-end',
          String((page + 1) * 20),
        ],
      );
      const tracks = (info.entries ?? [])
        .filter((entry): entry is Extracted => !!entry)
        .map((entry) => this.remember(entry))
        .filter((track): track is Track => !!track);
      return {
        tracks,
        title: info.title || 'YouTube playlist',
        nextPage:
          info.entries?.length === 20 && page < 49 ? page + 1 : undefined,
      };
    });
  }

  async track(id: string) {
    if (!validVideo(id))
      throw new ServiceError('Invalid YouTube video ID.', 400);
    return this.metadata.get(id)?.track ?? (await this.audio(id, 'best')).track;
  }

  async audio(
    id: string,
    format: Settings['audioFormat'],
    refresh = false,
  ): Promise<ResolvedAudio> {
    if (!validVideo(id) || !['best', 'm4a'].includes(format))
      throw new ServiceError('Invalid video ID or audio format.', 400);
    const key = `audio:${id}:${format}`;
    if (refresh) this.cache.delete(key);
    return this.cached(
      key,
      async () => {
        const info = await this.extract(
          `https://www.youtube.com/watch?v=${id}`,
          [
            '--no-playlist',
            '--format',
            format === 'm4a'
              ? 'bestaudio[ext=m4a][protocol=https]'
              : 'bestaudio[protocol=https]',
          ],
        );
        const track = this.remember(info, true);
        if (!track || !info.url || info.vcodec !== 'none')
          throw new ServiceError(
            'This item is not a supported on-demand audio track. Live and restricted streams are not supported.',
            422,
          );
        mediaUrl(info.url);
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(info.http_headers ?? {}))
          if (
            [
              'user-agent',
              'referer',
              'origin',
              'accept',
              'accept-language',
            ].includes(key.toLowerCase()) &&
            typeof value === 'string' &&
            !/[\r\n]/.test(value)
          )
            headers[key] = value;
        return {
          track,
          url: info.url,
          headers,
          contentType:
            info.ext === 'm4a'
              ? 'audio/mp4'
              : info.ext === 'webm'
                ? 'audio/webm'
                : 'application/octet-stream',
        };
      },
      180_000,
    );
  }
}
