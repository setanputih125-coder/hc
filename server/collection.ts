import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Library, Playlist, Settings, Track } from '../shared/types.js';
import { readJson, SerialWriter, writeJson } from './store.js';
import { ServiceError } from './ytdlp.js';

export class Collection {
  library: Library = { tracks: [], favorites: [], playlists: [] };
  settings: Settings = { audioFormat: 'best', lyricsEnabled: true };
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
    this.settings = {
      audioFormat: saved.audioFormat === 'm4a' ? 'm4a' : 'best',
      lyricsEnabled: saved.lyricsEnabled !== false,
    };
  }
  saveSettings(settings: Settings) {
    return this.writer.run(async () => {
      await writeJson(join(this.dataDir, 'preferences.json'), settings);
      this.settings = settings;
      return settings;
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
