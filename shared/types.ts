export interface Track {
  id: string;
  source: 'youtube';
  title: string;
  artist: string;
  album: string;
  duration: number;
  artwork?: string;
  format?: string;
  bitrate?: number;
  externalUrl: string;
  lyricsTitle?: string;
  lyricsArtist?: string;
}

export interface LyricCandidate {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  synced: boolean;
  instrumental: boolean;
}

export interface Lyrics {
  lines: { time: number; text: string }[];
  plain: string;
  origin: 'lrclib' | 'none';
  recordId?: number;
  record?: LyricCandidate;
  instrumental?: boolean;
  candidates?: LyricCandidate[];
  matched?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: string;
}

export interface Library {
  tracks: Track[];
  favorites: string[];
  playlists: Playlist[];
}

export interface Settings {
  audioFormat: 'best' | 'm4a';
  lyricsEnabled: boolean;
  radioEnabled: boolean;
  historyEnabled: boolean;
  crossfadeSeconds: number;
  normalizeVolume: boolean;
  playbackRate: number;
  theme: Theme;
  equalizer: Equalizer;
}

export type Theme = 'undertone' | 'noir' | 'ember' | 'tide';

export interface Equalizer {
  enabled: boolean;
  preset: string;
  preamp: number;
  bands: number[];
}

export interface PlayEvent {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork?: string;
  playedAt: string;
  seconds: number;
}

export interface StatEntry {
  key: string;
  label: string;
  detail?: string;
  artwork?: string;
  plays: number;
  seconds: number;
}

export interface Stats {
  plays: number;
  seconds: number;
  tracks: number;
  artists: number;
  days: number;
  since?: string;
  topTracks: StatEntry[];
  topArtists: StatEntry[];
  recent: PlayEvent[];
}

export interface PlayerState {
  queue: Track[];
  index: number;
  position: number;
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  updatedAt?: string;
}

export interface Backup {
  application: 'undertone';
  version: 1;
  exportedAt: string;
  library: Library;
  settings: Settings;
}

export interface CatalogPage {
  tracks: Track[];
  title: string;
  nextPage?: number;
}

export interface Health {
  available: boolean;
  version?: string;
  message?: string;
  engine: 'yt-dlp';
}
