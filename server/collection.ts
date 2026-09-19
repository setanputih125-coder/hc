import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  Backup,
  Library,
  PlayEvent,
  PlayerState,
  Playlist,
  Settings,
  Stats,
  Track,
} from '../shared/types.js';
import { defaultSettings, normalizeSettings } from '../shared/settings.js';
import { HISTORY_LIMIT, summarize } from '../shared/stats.js';
import { readJson, SerialWriter, writeJson } from './store.js';
import { ServiceError } from './ytdlp.js';

export class Collection {
  library: Library = { tracks: [], favorites: [], playlists: [] };
  settings: Settings = defaultSettings();
  history: PlayEvent[] = [];
  player: PlayerState = {
    queue: [],
    index: 0,
    position: 0,
    volume: 0.7,
    shuffle: false,
    repeat: 'off',
  };
  private writer = new SerialWriter();
  constructor(private dataDir: string) {}
  async init() {
    this.library = await readJson(
      join(this.dataDir, 'online-library.json'),
      this.library,
    );
    const saved = await readJson<Partial<Settings>>(
      join(this.dataDir, 'preferences.json'),
      this.settings,
    );
    this.settings = normalizeSettings(saved);
    this.history = (
      await readJson<PlayEvent[]>(join(this.dataDir, 'history.json'), [])
    ).slice(-HISTORY_LIMIT);
    this.player = {
      ...this.player,
      ...(await readJson<Partial<PlayerState>>(
        join(this.dataDir, 'player.json'),
        {},
      )),
    };
  }
  saveSettings(settings: Settings) {
    return this.writer.run(async () => {
      await writeJson(join(this.dataDir, 'preferences.json'), settings);
      this.settings = settings;
      return settings;
    });
  }
  savePlayer(state: PlayerState) {
    return this.writer.run(async () => {
      const next = { ...state, updatedAt: new Date().toISOString() };
      await writeJson(join(this.dataDir, 'player.json'), next);
      this.player = next;
      return next;
    });
  }
  record(event: PlayEvent) {
    return this.writer.run(async () => {
      const next = [...this.history, event].slice(-HISTORY_LIMIT);
      await writeJson(join(this.dataDir, 'history.json'), next);
      this.history = next;
      return next.length;
    });
  }
  clearHistory() {
    return this.writer.run(async () => {
      await writeJson(join(this.dataDir, 'history.json'), []);
      this.history = [];
    });
  }
  stats(limit = 10): Stats {
    return summarize(this.history, limit);
  }
  /** Track metadata for history entries is kept only for tracks still referenced by the library. */
  export(): Backup {
    return {
      application: 'undertone',
      version: 1,
      exportedAt: new Date().toISOString(),
      library: structuredClone(this.library),
      settings: { ...this.settings },
    };
  }
  import(backup: Backup) {
    return this.writer.run(async () => {
      const tracks = backup.library.tracks;
      const known = new Set(tracks.map((track) => track.id));
      const library: Library = {
        tracks,
        favorites: [...new Set(backup.library.favorites)].filter((id) =>
          known.has(id),
        ),
        playlists: backup.library.playlists.slice(0, 100).map((playlist) => ({
          id: playlist.id || randomUUID(),
          name: playlist.name.slice(0, 100),
          trackIds: playlist.trackIds
            .filter((id) => known.has(id))
            .slice(0, 1000),
          createdAt: playlist.createdAt || new Date().toISOString(),
        })),
      };
      const settings = normalizeSettings(backup.settings);
      await writeJson(join(this.dataDir, 'online-library.json'), library);
      await writeJson(join(this.dataDir, 'preferences.json'), settings);
      this.library = library;
      this.settings = settings;
      return { library, settings };
    });
  }
  private change<T>(update: (library: Library) => T) {
    return this.writer.run(async () => {
      const next = structuredClone(this.library);
      const result = update(next);
      const ids = new Set([
        ...next.favorites,
        ...next.playlists.flatMap((playlist) => playlist.trackIds),
      ]);
      next.tracks = next.tracks.filter((track) => ids.has(track.id));
      await writeJson(join(this.dataDir, 'online-library.json'), next);
      this.library = next;
      return result;
    });
  }
  favorite(track: Track) {
    return this.change((library) => {
      if (library.favorites.length >= 1000)
        throw new ServiceError(
          'Your library can hold up to 1,000 favorites.',
          400,
        );
      if (!library.favorites.includes(track.id))
        library.favorites.push(track.id);
      library.tracks = [
        ...library.tracks.filter((item) => item.id !== track.id),
        track,
      ];
    });
  }
  unfavorite(id: string) {
    return this.change((library) => {
      library.favorites = library.favorites.filter((item) => item !== id);
    });
  }
  create(name: string, tracks: Track[] = []) {
    return this.change((library) => {
      if (library.playlists.length >= 100)
        throw new ServiceError(
          'Your library can hold up to 100 playlists.',
          400,
        );
      const playlist: Playlist = {
        id: randomUUID(),
        name,
        trackIds: tracks.map((track) => track.id),
        createdAt: new Date().toISOString(),
      };
      for (const track of tracks)
        if (!library.tracks.some((item) => item.id === track.id))
          library.tracks.push(track);
      library.playlists.push(playlist);
      return playlist;
    });
  }
  update(id: string, name?: string, trackIds?: string[], track?: Track) {
    return this.change((library) => {
      const playlist = library.playlists.find((item) => item.id === id);
      if (!playlist) throw new ServiceError('Playlist not found.', 404);
      if (track) {
        if (playlist.trackIds.length >= 1000)
          throw new ServiceError('Playlists can hold up to 1,000 tracks.', 400);
        playlist.trackIds.push(track.id);
        if (!library.tracks.some((item) => item.id === track.id))
          library.tracks.push(track);
      }
      if (name !== undefined) playlist.name = name;
      if (trackIds !== undefined) {
        if (
          trackIds.some(
            (id) => !library.tracks.some((track) => track.id === id),
          )
        )
          throw new ServiceError('Playlist contains an unknown track.', 400);
        playlist.trackIds = trackIds;
      }
      return playlist;
    });
  }
  delete(id: string) {
    return this.change((library) => {
      if (!library.playlists.some((item) => item.id === id))
        throw new ServiceError('Playlist not found.', 404);
      library.playlists = library.playlists.filter((item) => item.id !== id);
    });
  }
}
