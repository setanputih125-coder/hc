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
