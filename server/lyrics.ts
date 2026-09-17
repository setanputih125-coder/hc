import { parseLyrics } from '../shared/lyrics.js';
import type { LyricCandidate, Lyrics, Track } from '../shared/types.js';
import { ServiceError } from './ytdlp.js';

interface RecordLyrics {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}
export interface LyricsService {
  lookup(track: Track): Promise<Lyrics>;
  search(query: string, duration: number): Promise<LyricCandidate[]>;
  get(id: number): Promise<Lyrics>;
}
function sameDuration(recordDuration: number, trackDuration: number) {
  return (
    Number.isFinite(recordDuration) &&
    Number.isFinite(trackDuration) &&
    recordDuration > 0 &&
    trackDuration > 0 &&
    Math.floor(recordDuration) === Math.floor(trackDuration)
  );
}
const normalized = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

export function exactLyrics(records: RecordLyrics[], track: Track) {
  if (!track.lyricsArtist || !track.duration) return undefined;
  const matches = records.filter(
    (record) =>
      normalized(record.trackName) ===
        normalized(track.lyricsTitle || track.title) &&
      normalized(record.artistName) === normalized(track.lyricsArtist!) &&
      sameDuration(record.duration, track.duration),
  );
  const albumMatches =
    track.album !== 'YouTube'
      ? matches.filter(
          (record) => normalized(record.albumName) === normalized(track.album),
        )
      : [];
  const selected = albumMatches.length ? albumMatches : matches;
  return selected.length === 1 ? selected[0] : undefined;
}

function candidate(record: RecordLyrics): LyricCandidate {
  return {
    id: record.id,
    title: record.trackName,
    artist: record.artistName,
    album: record.albumName,
    duration: record.duration,
    synced: !!record.syncedLyrics,
    instrumental: record.instrumental,
  };
}

function lyrics(record: RecordLyrics): Lyrics {
  const parsed = record.syncedLyrics
    ? parseLyrics(record.syncedLyrics, 'lrclib')
    : { lines: [], plain: record.plainLyrics || '', origin: 'lrclib' as const };
  return {
    ...parsed,
    recordId: record.id,
    record: candidate(record),
    instrumental: record.instrumental,
  };
}

export class LrcLib implements LyricsService {
  private tail: Promise<unknown> = Promise.resolve();
  private nextRequest = 0;
  private cooldown = 0;
  private pending = 0;
  private cache = new Map<string, { until: number; data: unknown }>();
  constructor(
    private fetcher: typeof fetch = fetch,
    private delay = 350,
  ) {}

  private async request<T>(path: string): Promise<T> {
    const cached = this.cache.get(path);
    if (cached && cached.until > Date.now()) return cached.data as T;
    if (this.pending >= 20)
      throw new ServiceError(
        'Lyrics requests are busy. Try again shortly.',
        503,
      );
    this.pending++;
    const task = async () => {
      const hit = this.cache.get(path);
      if (hit && hit.until > Date.now()) return hit.data as T;
      if (this.cooldown > Date.now())
        throw new ServiceError(
          `LRCLIB is rate-limiting requests. Try again in ${Math.ceil((this.cooldown - Date.now()) / 1000)} seconds.`,
          429,
        );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, this.nextRequest - Date.now())),
      );
      try {
        const response = await this.fetcher(`https://lrclib.net/api/${path}`, {
          headers: {
            'User-Agent':
              'Undertone/1.0 (https://github.com/setanputih152-afk/hc)',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(20_000),
          redirect: 'error',
        });
        if (response.status === 429) {
          const retry = response.headers.get('Retry-After') || '60';
          const wait = /^\d+$/.test(retry)
            ? Number(retry) * 1000
            : Date.parse(retry) - Date.now();
          this.cooldown =
            Date.now() + Math.max(1000, Number.isFinite(wait) ? wait : 60_000);
          throw new ServiceError(
            `LRCLIB is rate-limiting requests. Try again in ${Math.ceil((this.cooldown - Date.now()) / 1000)} seconds.`,
            429,
          );
        }
        if (response.status === 404)
          throw new ServiceError('Lyrics were not found in LRCLIB.', 404);
        if (!response.ok)
          throw new ServiceError(
            `LRCLIB is unavailable (${response.status}). Your music can keep playing.`,
          );
        const reader = response.body?.getReader();
        if (!reader)
          throw new ServiceError('LRCLIB returned an empty response.');
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > 2_000_000) {
              await reader.cancel();
              throw new ServiceError(
                'LRCLIB returned too much data. Narrow your lyrics search.',
              );
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
        if (this.cache.size >= 100)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(path, { until: Date.now() + 86_400_000, data });
        return data;
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        throw new ServiceError(
          'Could not reach LRCLIB. Your music can keep playing; retry lyrics later.',
        );
      } finally {
        this.nextRequest = Date.now() + this.delay;
      }
    };
    const result = this.tail.then(task, task).finally(() => {
      this.pending--;
    });
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async records(parameters: URLSearchParams) {
    const values = await this.request<RecordLyrics[]>(`search?${parameters}`);
    if (!Array.isArray(values))
      throw new ServiceError('LRCLIB returned invalid search results.');
    const records = values.filter(
      (record) =>
        Number.isSafeInteger(record.id) &&
        typeof record.trackName === 'string' &&
        typeof record.artistName === 'string',
    );
    for (const record of records) {
      if (this.cache.size >= 100)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(`get/${record.id}`, {
        until: Date.now() + 86_400_000,
        data: record,
      });
    }
    return records;
  }

  async lookup(track: Track): Promise<Lyrics> {
    if (!Number.isFinite(track.duration) || track.duration <= 0)
      return {
        lines: [],
        plain: '',
        origin: 'none',
        matched: false,
        candidates: [],
      };
    if (track.lyricsArtist && track.duration > 0 && track.album !== 'YouTube') {
      const signature = new URLSearchParams({
        track_name: track.lyricsTitle || track.title,
        artist_name: track.lyricsArtist,
        album_name: track.album,
        duration: String(track.duration),
      });
      try {
        const record = await this.request<RecordLyrics>(`get?${signature}`);
        if (
          !Number.isSafeInteger(record.id) ||
          typeof record.trackName !== 'string' ||
          typeof record.artistName !== 'string'
        )
          throw new ServiceError('LRCLIB returned invalid lyrics metadata.');
        const match = exactLyrics([record], track);
        if (match) {
          this.cache.set(`get/${record.id}`, {
            until: Date.now() + 86_400_000,
            data: record,
          });
          return {
            ...lyrics(record),
            matched: true,
            candidates: [candidate(record)],
          };
        }
      } catch (error) {
        if (!(error instanceof ServiceError) || error.status !== 404)
          throw error;
      }
    }
    const parameters = new URLSearchParams({
      track_name: track.lyricsTitle || track.title,
    });
    if (track.lyricsArtist) parameters.set('artist_name', track.lyricsArtist);
    const records = (await this.records(parameters)).filter((record) =>
      sameDuration(record.duration, track.duration),
    );
    const match = exactLyrics(records, track);
    return {
      ...(match
        ? lyrics(match)
        : { lines: [], plain: '', origin: 'none' as const }),
      matched: !!match,
      candidates: records.map(candidate),
    };
  }
  async search(query: string, duration: number) {
    if (!Number.isFinite(duration) || duration <= 0)
      throw new ServiceError(
        'A valid track duration is required to find lyrics.',
        400,
      );
    return (await this.records(new URLSearchParams({ q: query })))
      .filter((record) => sameDuration(record.duration, duration))
      .map(candidate);
  }
  async get(id: number): Promise<Lyrics> {
    const record = await this.request<RecordLyrics>(`get/${id}`);
    if (
      !Number.isSafeInteger(record.id) ||
      typeof record.trackName !== 'string'
    )
      throw new ServiceError('LRCLIB returned invalid lyrics.');
    return { ...lyrics(record), matched: false };
  }
}
