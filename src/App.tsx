import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ExternalLink,
  Headphones,
  Heart,
  House,
  LibraryBig,
  ListMusic,
  LoaderCircle,
  LockKeyhole,
  Music2,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  CatalogPage,
  Health,
  Library,
  Playlist,
  Settings,
  Track,
} from '../shared/types';
import { youtubeLink } from '../shared/youtube';
import { api } from './api';
import { Artwork } from './components/Artwork';
import { LyricsPanel } from './components/LyricsPanel';
import { PlayerBar, timeLabel } from './components/PlayerBar';
import { PlaybackOptions } from './components/PlaybackOptions';
import { SettingsPanel } from './components/SettingsPanel';
import { usePlayer } from './usePlayer';

type View = 'home' | 'songs' | 'library' | 'playlists' | 'settings';
type Catalog =
  | { kind: 'search'; query: string }
  | { kind: 'playlist'; id: string }
  | { kind: 'video'; id: string };
const moods = [
  { title: 'Slow mornings', query: 'acoustic chill music', color: '#403e2d' },
  { title: 'After hours', query: 'late night jazz music', color: '#353348' },
  {
    title: 'Find your focus',
    query: 'instrumental focus music',
    color: '#344337',
  },
  {
    title: 'A little louder',
    query: 'indie rock official audio',
    color: '#4b3631',
  },
];

export function App() {
  const [view, setView] = useState<View>('home');
  const [library, setLibrary] = useState<Library>({
    tracks: [],
    favorites: [],
    playlists: [],
  });
  const [settings, setSettings] = useState<Settings>({
    audioFormat: 'best',
    lyricsEnabled: true,
  });
  const [health, setHealth] = useState<Health>();
  const [authenticated, setAuthenticated] = useState<boolean>();
  const [password, setPassword] = useState('');
  const [bootError, setBootError] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [link, setLink] = useState('');
  const [catalog, setCatalog] = useState<Catalog>({
    kind: 'search',
    query: 'chill music',
  });
  const [remote, setRemote] = useState<CatalogPage>({ tracks: [], title: '' });
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>();
  const [panel, setPanel] = useState('');
  const [playlistDialog, setPlaylistDialog] = useState<{ track?: Track }>();
  const [playlistName, setPlaylistName] = useState('');
  const request = useRef<AbortController | undefined>(undefined);
  const modalRef = useRef<HTMLElement>(null);
  const notify = useCallback(
    (text: string) => setMessage({ text, error: true }),
    [],
  );
  const player = usePlayer(notify);
  const playlist = library.playlists.find(
    (item) => item.id === selectedPlaylist,
  );
  const tracks = playlist
    ? playlist.trackIds
        .map((id) => library.tracks.find((track) => track.id === id))
        .filter((track): track is Track => !!track)
    : view === 'library'
      ? library.favorites
          .map((id) => library.tracks.find((track) => track.id === id))
          .filter((track): track is Track => !!track)
      : remote.tracks;
  const heroTrack = remote.tracks[0];

  async function refreshLibrary() {
    setLibrary(await api<Library>('/api/library'));
  }
  async function refreshHealth() {
    try {
      setHealth(await api<Health>('/api/health'));
    } catch (error) {
      notify((error as Error).message);
    }
  }
  async function boot() {
    setBootError('');
    try {
      const session = await api<{ authenticated: boolean }>('/api/session');
      setAuthenticated(session.authenticated);
      if (session.authenticated) {
        const [library, preferences, engine] = await Promise.all([
          api<Library>('/api/library'),
          api<Settings>('/api/settings'),
          api<Health>('/api/health'),
        ]);
        setLibrary(library);
        setSettings(preferences);
        setHealth(engine);
      }
    } catch (error) {
      setBootError((error as Error).message);
    }
  }
  useEffect(() => {
    void boot();
  }, []);
  useEffect(() => {
    if (!playlistDialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !modal) return;
      const controls = [
        ...modal.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled)',
        ),
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    modal?.addEventListener('keydown', trap);
    return () => {
      modal?.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, [playlistDialog]);
  async function action(task: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await task();
      if (success) setMessage({ text: success, error: false });
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: View) {
    setView(next);
    setSelectedPlaylist(undefined);
    setQuery('');
    if (next === 'home') setCatalog({ kind: 'search', query: 'chill music' });
  }
  async function loadRemote(append = false) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRemoteLoading(true);
    setRemoteError('');
    try {
      const page = append ? (remote.nextPage ?? 0) : 0;
      let result: CatalogPage;
      if (catalog.kind === 'video') {
        const track = await api<Track>(
          `/api/tracks/${catalog.id}`,
          'GET',
          undefined,
          controller.signal,
        );
        result = { tracks: [track], title: track.title };
      } else
        result = await api<CatalogPage>(
          catalog.kind === 'search'
            ? `/api/search?q=${encodeURIComponent(catalog.query)}&page=${page}`
            : `/api/youtube/playlists/${catalog.id}?page=${page}`,
          'GET',
          undefined,
          controller.signal,
        );
      if (!controller.signal.aborted)
        setRemote((previous) => ({
          ...result,
          tracks: append
            ? [...previous.tracks, ...result.tracks]
            : result.tracks,
        }));
    } catch (error) {
      if (!controller.signal.aborted) setRemoteError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setRemoteLoading(false);
    }
  }
  useEffect(() => {
    request.current?.abort();
    setRemote({ tracks: [], title: '' });
    setRemoteError('');
    setRemoteLoading(false);
    if (
      authenticated &&
      health?.available &&
      (view === 'home' || view === 'songs') &&
      !selectedPlaylist
    )
      void loadRemote();
    return () => request.current?.abort();
  }, [catalog, view, authenticated, health?.available, selectedPlaylist]);
  function search(value: string) {
    const text = value.trim();
    if (!text) return;
    const target = youtubeLink(text);
    setSelectedPlaylist(undefined);
    setView('songs');
    setLink('');
    if (target?.playlistId && !target.videoId) {
      setCatalog({ kind: 'playlist', id: target.playlistId });
      setQuery('');
    } else if (target?.videoId) {
      setCatalog({ kind: 'video', id: target.videoId });
      void action(async () => {
        const track = await api<Track>(`/api/tracks/${target.videoId}`);
        await player.play([track]);
      });
    } else if (/^https?:\/\//i.test(text))
      notify(
        'Use a YouTube video or playlist URL. Other websites are not supported.',
      );
    else {
      setQuery(text);
      setCatalog({ kind: 'search', query: text });
    }
  }
  async function saveSettings(next: Settings) {
    await action(
      async () =>
        setSettings(await api<Settings>('/api/settings', 'PUT', next)),
      'Preferences saved. Audio format applies to the next track load.',
    );
  }
  function newPlaylist(track?: Track) {
    setPlaylistName('');
    setPlaylistDialog({ track });
  }
  function openPlaylist(playlist: Playlist) {
    setSelectedPlaylist(playlist.id);
    setView('playlists');
    setQuery('');
  }
  function favorite(track: Track) {
    void action(async () =>
      setLibrary(
        await api<Library>(
          library.favorites.includes(track.id)
            ? `/api/favorites/${track.id}`
            : '/api/favorites',
          library.favorites.includes(track.id) ? 'DELETE' : 'POST',
          library.favorites.includes(track.id)
            ? undefined
            : { trackId: track.id },
        ),
      ),
    );
  }
  async function addToPlaylist(playlist: Playlist, track: Track) {
    await api(`/api/playlists/${playlist.id}/tracks`, 'POST', {
      trackId: track.id,
    });
    await refreshLibrary();
    setPlaylistDialog(undefined);
  }
  async function reorder(at: number, direction: number) {
    if (!playlist) return;
    const next = [...playlist.trackIds];
    const to = at + direction;
    [next[at], next[to]] = [next[to], next[at]];
    await action(async () => {
      await api(`/api/playlists/${playlist.id}`, 'PUT', { trackIds: next });
      await refreshLibrary();
    });
  }

  const renderTrackList = (list: Track[], compact = false) => (
    <div className={`track-list ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="track-header">
          <span>#</span>
          <span>Title · Artist / channel</span>
          <span className="track-album">Album</span>
          <span className="track-format">Source</span>
          <span>Time</span>
          <span />
        </div>
      )}
      {list.map((track, i) => (
        <div
          className={`track-row ${player.current?.id === track.id ? 'selected' : ''}`}
          key={`${track.id}-${i}`}
        >
          <span className="track-number">
            {player.current?.id === track.id && player.playing ? (
              <span className="equalizer">
                <i />
                <i />
                <i />
              </span>
            ) : (
              String(i + 1).padStart(2, '0')
            )}
          </span>
          <button
            className="track-main"
            aria-label={`Play ${track.title}`}
            onClick={() => player.play(list, i)}
          >
            <Artwork src={track.artwork} title={track.title} />
            <span>
              <strong>{track.title}</strong>
              <small>{track.artist}</small>
            </span>
            <Play className="row-play" size={16} fill="currentColor" />
          </button>
          <span className="track-album">{track.album}</span>
          <span className="track-format">
            <span className="format-tag">yt-dlp</span>
          </span>
          <span className="track-time">
            {track.duration ? timeLabel(track.duration) : '—'}
          </span>
          <div className="track-actions">
            <button
              className={`icon-button ${library.favorites.includes(track.id) ? 'active' : ''}`}
              aria-label={`${library.favorites.includes(track.id) ? 'Unsave' : 'Save'} ${track.title}`}
              onClick={() => favorite(track)}
              disabled={busy}
            >
              <Heart
                size={16}
                fill={
                  library.favorites.includes(track.id) ? 'currentColor' : 'none'
                }
              />
            </button>
            <button
              className="icon-button"
              aria-label={`Add ${track.title} to queue`}
              onClick={() => player.add(track)}
            >
              <ListMusic size={17} />
            </button>
            <button
              className="icon-button"
              aria-label={`Add ${track.title} to playlist`}
              onClick={() => newPlaylist(track)}
            >
              <Plus size={17} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate('home')}
          aria-label="Undertone home"
        >
          <img src="/icon.svg" alt="" />
          <span>
            undertone<span className="brand-period">.</span>
          </span>
        </button>
        <span className="sidebar-caption">YOUR LISTENING ROOM</span>
        <div className="engine-chip">
          <span className="youtube-mark">▶</span>
          <strong>YouTube</strong>
          <span>yt-dlp</span>
        </div>
        <nav aria-label="Main navigation">
          <button
            className={view === 'home' ? 'nav-active' : ''}
            onClick={() => navigate('home')}
          >
            <House />
            Home
            <span className="nav-dot" />
          </button>
          <button
            className={view === 'songs' ? 'nav-active' : ''}
            onClick={() => navigate('songs')}
          >
            <Music2 />
            Explore
          </button>
          <span className="nav-label">YOUR COLLECTION</span>
          <button
            className={view === 'library' ? 'nav-active' : ''}
            onClick={() => navigate('library')}
          >
            <Heart />
            Saved songs
          </button>
          <button
            className={view === 'playlists' ? 'nav-active' : ''}
            onClick={() => navigate('playlists')}
          >
            <ListMusic />
            Playlists
          </button>
        </nav>
        <div className="sidebar-playlists">
          <div className="playlist-label">
            <span className="nav-label">MADE BY YOU</span>
            <button
              className="icon-button"
              aria-label="Create playlist"
              onClick={() => newPlaylist()}
            >
              <Plus size={16} />
            </button>
          </div>
          {library.playlists.slice(0, 5).map((playlist) => (
            <button key={playlist.id} onClick={() => openPlaylist(playlist)}>
              <span className="playlist-mark" />
              {playlist.name}
            </button>
          ))}
          {!library.playlists.length && <p>Your next mixtape starts here.</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={18} />
            <div>
              <strong>Your music. Your space.</strong>
              <span>No folders. No API keys.</span>
            </div>
          </div>
          <button
            className={`settings-link ${view === 'settings' ? 'nav-active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={18} />
            Settings & connections
          </button>
          <span className="version">
            UNDERTONE<span>yt-dlp + LRCLIB</span>
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <form
            className="search-box"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              search(query);
            }}
          >
            <Search size={19} />
            <input
              aria-label="Search music"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search songs, artists, or paste a YouTube link"
              maxLength={200}
            />
            {query && (
              <button
                className="icon-button"
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                <X size={16} />
              </button>
            )}
            <kbd>↵</kbd>
          </form>
          <div className="server-status">
            <span
              className={`status-light ${health?.available ? '' : 'offline'}`}
            />
            {health?.available
              ? 'yt-dlp connected'
              : 'Connecting to your server'}
          </div>
          <button
            className="avatar"
            aria-label="Open settings"
            onClick={() => navigate('settings')}
          >
            <Headphones size={19} />
          </button>
        </header>
        <main>
          {authenticated === false ? (
            <section className="empty-state login-card">
              <LockKeyhole />
              <span className="eyebrow">YOUR PRIVATE LISTENING ROOM</span>
              <h1>Welcome back.</h1>
              <p>Enter your music server password.</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  action(async () => {
                    await api('/api/session', 'POST', { password });
                    setPassword('');
                    await boot();
                  });
                }}
              >
                <label>
                  Server password
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </label>
                <button className="primary-button" disabled={busy}>
                  Unlock
                  <ArrowRight size={17} />
                </button>
              </form>
            </section>
          ) : bootError ? (
            <section className="empty-state">
              <Radio />
              <h1>Out of range.</h1>
              <p role="alert">{bootError}</p>
              <button className="primary-button" onClick={boot}>
                Try again
                <RefreshCw size={17} />
              </button>
            </section>
          ) : authenticated === undefined ? (
            <div className="empty-state">
              <LoaderCircle className="spin" />
              <p>Opening your listening room…</p>
            </div>
          ) : view === 'settings' ? (
            <SettingsPanel
              settings={settings}
              health={health}
              busy={busy}
              save={saveSettings}
              refresh={refreshHealth}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    MUSIC FROM YOUTUBE · WORDS FROM LRCLIB
                  </span>
                  <h1>
                    {playlist?.name ||
                      (view === 'home'
                        ? 'Stay a little longer.'
                        : view === 'library'
                          ? 'Always worth a replay.'
                          : view === 'playlists'
                            ? 'Made for the moment.'
                            : catalog.kind === 'playlist'
                              ? remote.title || 'Your YouTube playlist'
                              : 'Find your frequency.')}
                  </h1>
                  <p>
                    {playlist
                      ? `${tracks.length} songs · Saved on your server`
                      : view === 'home'
                        ? 'A space for your favorites. And whatever comes next.'
                        : view === 'library'
                          ? `${tracks.length} saved songs · No files needed.`
                          : view === 'playlists'
                            ? 'A soundtrack for every version of your day.'
                            : catalog.kind === 'search'
                              ? `YouTube results for “${catalog.query}”`
                              : 'Open a link. Find a song. Let it play.'}
                  </p>
                </div>
                <div className="heading-actions">
                  {playlist && (
                    <button
                      className="icon-button"
                      aria-label="Back to playlists"
                      onClick={() => setSelectedPlaylist(undefined)}
                    >
                      <ArrowLeft />
                    </button>
                  )}
                  {view === 'playlists' && !playlist && (
                    <button
                      className="primary-button"
                      onClick={() => newPlaylist()}
                    >
                      <Plus size={16} />
                      New playlist
                    </button>
                  )}
                  {view === 'home' && (
                    <button
                      className="outline-button scan-button"
                      disabled={remoteLoading}
                      onClick={() => loadRemote()}
                    >
                      <RefreshCw
                        size={15}
                        className={remoteLoading ? 'spin' : ''}
                      />
                      Refresh discovery
                    </button>
                  )}
                </div>
              </div>
              {!health?.available && (
                <div className="notice error" role="alert">
                  <strong>Connect your extractor.</strong>
                  <p>{health?.message || 'Checking yt-dlp on your server…'}</p>
                  <button className="text-button" onClick={refreshHealth}>
                    Check again
                  </button>
                </div>
              )}
              {view === 'home' && (
                <>
                  <section className="hero">
                    <div className="hero-grain" />
                    <div className="hero-copy">
                      <span className="hero-kicker">
                        <span />
                        ONE MORE SONG. ONE MORE DISCOVERY.
                      </span>
                      <h2>
                        Follow the music.
                        <br />
                        Find your moment.
                      </h2>
                      <p>
                        Your next favorite, one search away. Synced lyrics when
                        you want to sing along.
                      </p>
                      <div className="hero-buttons">
                        <button
                          className="primary-button"
                          onClick={() =>
                            heroTrack
                              ? player.play(remote.tracks)
                              : document
                                  .querySelector<HTMLInputElement>(
                                    '[aria-label="Search music"]',
                                  )
                                  ?.focus()
                          }
                        >
                          <Play size={17} fill="currentColor" />
                          {heroTrack ? 'Press play' : 'Find your music'}
                        </button>
                        <button
                          className="hero-link"
                          onClick={() => setPanel('lyrics')}
                        >
                          A word at a time
                          <ArrowRight size={17} />
                        </button>
                      </div>
                      <span className="hero-footnote">
                        <span className="tiny-wave">▂▅▃▆▂</span>yt-dlp audio.
                        Online lyrics. Nothing to upload.
                      </span>
                    </div>
                    <div className="hero-art">
                      <div className="vinyl">
                        <div className="vinyl-center" />
                      </div>
                      <Artwork
                        src={heroTrack?.artwork}
                        title={heroTrack?.title || 'Undertone'}
                      />
                      <div className="record-caption">
                        <span>THE LISTENING ROOM</span>
                        <span>VOL. 001</span>
                      </div>
                    </div>
                  </section>
                  <section className="mood-grid" aria-label="Explore a mood">
                    {moods.map((mood) => (
                      <button
                        key={mood.title}
                        style={{ background: mood.color }}
                        onClick={() => search(mood.query)}
                      >
                        <span>{mood.title}</span>
                        <ArrowRight size={17} />
                      </button>
                    ))}
                  </section>
                </>
              )}
              {(view === 'home' || (view === 'playlists' && !playlist)) && (
                <section className="youtube-connect">
                  <div className="section-heading">
                    <span className="youtube-mark">▶</span>
                    <h2>Bring a link, not a file.</h2>
                  </div>
                  <p>
                    Paste a YouTube video or public playlist. No Google account,
                    API key, music folder, or lyrics file required.
                  </p>
                  <form
                    className="link-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      search(link);
                    }}
                  >
                    <input
                      id="youtube-link"
                      aria-label="YouTube video or playlist link"
                      value={link}
                      onChange={(event) => setLink(event.target.value)}
                      placeholder="Paste a youtube.com or youtu.be link"
                      required
                    />
                    <button className="primary-button" disabled={busy}>
                      <Play size={15} fill="currentColor" />
                      Open
                    </button>
                  </form>
                </section>
              )}
              {(view === 'home' || view === 'songs') && remoteError && (
                <div className="notice error" role="alert">
                  <p>{remoteError}</p>
                  <button className="text-button" onClick={() => loadRemote()}>
                    Try again
                  </button>
                </div>
              )}
              {(view === 'home' || view === 'songs') && remoteLoading && (
                <div className="loading-line">
                  <LoaderCircle className="spin" size={17} />
                  Finding music through yt-dlp…
                </div>
              )}
              {view === 'playlists' && !playlist ? (
                <div className="playlist-grid">
                  {library.playlists.map((playlist) => (
                    <button
                      className="playlist-card"
                      key={playlist.id}
                      onClick={() => openPlaylist(playlist)}
                    >
                      <div className="playlist-cover">
                        <ListMusic size={34} />
                        <span>{playlist.name.slice(0, 1)}</span>
                      </div>
                      <h3>{playlist.name}</h3>
                      <p>{playlist.trackIds.length} songs · Made by you</p>
                    </button>
                  ))}
                  <button
                    className="new-playlist-card"
                    onClick={() => newPlaylist()}
                  >
                    <Plus size={28} />
                    <h3>A new kind of mood</h3>
                    <p>Create your own playlist</p>
                  </button>
                </div>
              ) : (
                <section className="songs-section">
                  <div className="section-title">
                    <div>
                      <h2>
                        {view === 'home'
                          ? 'Settle into something good'
                          : playlist
                            ? 'The tracklist'
                            : view === 'library'
                              ? 'Your favorites'
                              : 'In this frequency'}
                      </h2>
                      {view === 'home' && (
                        <p>
                          Live search results. One good song leads to another.
                        </p>
                      )}
                    </div>
                    <button
                      className="outline-button"
                      disabled={!tracks.length}
                      onClick={() => player.play(tracks)}
                    >
                      <Play size={15} fill="currentColor" />
                      Play {view === 'home' ? 'something' : 'all'}
                    </button>
                  </div>
                  {tracks.length
                    ? renderTrackList(
                        view === 'home' ? tracks.slice(0, 8) : tracks,
                        view === 'home',
                      )
                    : !remoteLoading && (
                        <div className="empty-small">
                          <LibraryBig />
                          <h3>
                            {playlist
                              ? 'A blank tape. All potential.'
                              : view === 'library'
                                ? 'Keep the ones that stay with you.'
                                : 'Nothing on this frequency yet.'}
                          </h3>
                          <p>
                            {playlist
                              ? 'Add songs with the + button in search results or your saved songs.'
                              : view === 'library'
                                ? 'Tap the heart beside a song to save it here.'
                                : 'Try another search, paste a public YouTube link, or check the extractor connection.'}
                          </p>
                        </div>
                      )}
                  {playlist && (
                    <>
                      <details className="playlist-order">
                        <summary>Edit playlist order</summary>
                        <div className="queue-list">
                          {tracks.map((track, index) => (
                            <div
                              className="queue-row"
                              key={`${track.id}-${index}`}
                            >
                              <span className="queue-track">
                                <span>
                                  <strong>{track.title}</strong>
                                  <small>{track.artist}</small>
                                </span>
                              </span>
                              <button
                                className="icon-button"
                                aria-label={`Move ${track.title} up in playlist`}
                                disabled={busy || index === 0}
                                onClick={() => reorder(index, -1)}
                              >
                                <ArrowUp size={15} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Move ${track.title} down in playlist`}
                                disabled={busy || index === tracks.length - 1}
                                onClick={() => reorder(index, 1)}
                              >
                                <ArrowDown size={15} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Remove ${track.title} from playlist`}
                                disabled={busy}
                                onClick={() =>
                                  action(async () => {
                                    await api(
                                      `/api/playlists/${playlist.id}`,
                                      'PUT',
                                      {
                                        trackIds: playlist.trackIds.filter(
                                          (_, at) => at !== index,
                                        ),
                                      },
                                    );
                                    await refreshLibrary();
                                  })
                                }
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </details>
                      <div className="playlist-footer">
                        <span className="field-help">
                          Playlist changes are saved on your server.
                        </span>
                        <button
                          className="text-button danger"
                          onClick={() => {
                            if (confirm(`Delete “${playlist.name}”?`))
                              action(async () => {
                                await api(
                                  `/api/playlists/${playlist.id}`,
                                  'DELETE',
                                );
                                setSelectedPlaylist(undefined);
                                await refreshLibrary();
                              });
                          }}
                        >
                          Delete playlist
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )}
              {(view === 'home' || view === 'songs') &&
                remote.nextPage !== undefined && (
                  <button
                    className="outline-button load-more"
                    disabled={remoteLoading}
                    onClick={() =>
                      view === 'home' ? setView('songs') : loadRemote(true)
                    }
                  >
                    {view === 'home' ? 'Explore more music' : 'Load more'}
                    <ArrowDown size={16} />
                  </button>
                )}
              <div className="home-footer">
                <span className="footer-wordmark">Listen closer.</span>
                <span>
                  <Headphones size={14} />
                  Music online. A space of your own.
                </span>
              </div>
            </>
          )}
        </main>
      </div>
      {message && (
        <div
          className={`toast ${message.error ? 'error' : ''}`}
          role={message.error ? 'alert' : 'status'}
        >
          {message.error ? <Radio size={18} /> : <Check size={18} />}
          <span>{message.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setMessage(undefined)}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {panel && (
        <aside
          className="detail-panel"
          aria-label={panel === 'lyrics' ? 'Lyrics panel' : 'Playback queue'}
        >
          <div className="detail-header">
            <span className="eyebrow">
              {panel === 'lyrics' ? 'A WORD AT A TIME' : 'THE NEXT CHAPTER'}
            </span>
            <button
              className="icon-button"
              aria-label="Close player panel"
              onClick={() => setPanel('')}
            >
              <X size={20} />
            </button>
          </div>
          <PlaybackOptions player={player} />
          {panel === 'lyrics' ? (
            <LyricsPanel
              key={player.current?.id}
              track={player.current}
              position={player.position}
              getPosition={player.getPosition}
              seek={player.seek}
              loading={player.loading}
              enabled={settings.lyricsEnabled}
            />
          ) : (
            <>
              <div className="panel-heading">
                <ListMusic size={21} />
                <h2>Up next</h2>
                <span className="pill">{player.queue.length} songs</span>
              </div>
              {!player.queue.length && (
                <div className="empty-small">
                  <ListMusic />
                  <h3>Room for a few more.</h3>
                  <p>
                    Add songs from a search or playlist to build your queue.
                  </p>
                </div>
              )}
              <div className="queue-list">
                {player.queue.map((track, i) => (
                  <div
                    key={`${track.id}-${i}`}
                    className={`queue-row ${i === player.index ? 'selected' : ''}`}
                  >
                    <button
                      className="queue-track"
                      onClick={() => player.play(player.queue, i)}
                    >
                      <Artwork src={track.artwork} title={track.title} />
                      <span>
                        <strong>{track.title}</strong>
                        <small>
                          {i === player.index ? 'Now playing' : track.artist}
                        </small>
                      </span>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Move ${track.title} up`}
                      disabled={i === 0}
                      onClick={() => player.move(i, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Move ${track.title} down`}
                      disabled={i === player.queue.length - 1}
                      onClick={() => player.move(i, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${track.title} from queue`}
                      disabled={i === player.index}
                      onClick={() => player.remove(i)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {player.current && (
            <a
              className="external-link"
              href={player.current.externalUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open source on YouTube
              <ExternalLink size={13} />
            </a>
          )}
        </aside>
      )}
      <PlayerBar player={player} panel={panel} setPanel={setPanel} />
      {playlistDialog && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget)
              setPlaylistDialog(undefined);
          }}
        >
          <section
            ref={modalRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="playlist-dialog-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setPlaylistDialog(undefined);
            }}
          >
            <div className="section-title">
              <h2 id="playlist-dialog-title">
                {playlistDialog.track
                  ? 'Find it a home.'
                  : 'Make a little mixtape.'}
              </h2>
              <button
                className="icon-button"
                aria-label="Close playlist dialog"
                onClick={() => setPlaylistDialog(undefined)}
              >
                <X />
              </button>
            </div>
            {playlistDialog.track && (
              <>
                <p className="muted">
                  Add “{playlistDialog.track.title}” to a playlist.
                </p>
                <div className="playlist-options">
                  {library.playlists.map((playlist) => (
                    <button
                      className="outline-button"
                      disabled={busy}
                      key={playlist.id}
                      onClick={() =>
                        action(
                          () => addToPlaylist(playlist, playlistDialog.track!),
                          'Track added to playlist.',
                        )
                      }
                    >
                      <ListMusic size={17} />
                      {playlist.name}
                      <Plus size={16} />
                    </button>
                  ))}
                </div>
              </>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                action(async () => {
                  const playlist = await api<Playlist>(
                    '/api/playlists',
                    'POST',
                    { name: playlistName },
                  );
                  if (playlistDialog.track)
                    await addToPlaylist(playlist, playlistDialog.track);
                  else {
                    await refreshLibrary();
                    setPlaylistDialog(undefined);
                    openPlaylist(playlist);
                  }
                }, 'Playlist saved.');
              }}
            >
              <label>
                New playlist name
                <input
                  autoFocus
                  value={playlistName}
                  required
                  maxLength={100}
                  placeholder="Slow Sunday, late nights, anything…"
                  onChange={(event) => setPlaylistName(event.target.value)}
                />
              </label>
              <button
                className="primary-button"
                disabled={busy || !playlistName.trim()}
              >
                <Plus size={17} />
                Create {playlistDialog.track ? '& add track' : 'playlist'}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
