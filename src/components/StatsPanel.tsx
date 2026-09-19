import {
  BarChart3,
  Clock3,
  Disc3,
  Flame,
  Mic2,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import type { Stats, Track } from '../../shared/types';
import { Artwork } from './Artwork';

export function listeningTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (!hours) return `${minutes} min`;
  return `${hours} hr ${minutes} min`;
}

export function StatsPanel({
  stats,
  tracks,
  busy,
  play,
  clear,
}: {
  stats?: Stats;
  tracks: Track[];
  busy: boolean;
  play: (id: string) => void;
  clear: () => void;
}) {
  const empty = !stats || !stats.plays;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE YEAR SO FAR</span>
          <h1>What you keep coming back to.</h1>
          <p>
            Counted on your own server after 20 seconds of a song. Nothing
            leaves your machine.
          </p>
        </div>
        <BarChart3 size={28} className="muted" />
      </div>
      {empty ? (
        <div className="empty-small">
          <TrendingUp />
          <h3>Your story starts with one song.</h3>
          <p>
            Play something for a while and your top tracks, artists, and
            listening time appear here.
          </p>
        </div>
      ) : (
        <>
          <section className="stat-cards">
            <div className="stat-card">
              <Clock3 size={18} />
              <strong>{listeningTime(stats.seconds)}</strong>
              <span>Time listened</span>
            </div>
            <div className="stat-card">
              <Flame size={18} />
              <strong>{stats.plays}</strong>
              <span>Songs played</span>
            </div>
            <div className="stat-card">
              <Disc3 size={18} />
              <strong>{stats.tracks}</strong>
              <span>Different tracks</span>
            </div>
            <div className="stat-card">
              <Mic2 size={18} />
              <strong>{stats.artists}</strong>
              <span>Artists & channels</span>
            </div>
          </section>
          <section className="stat-columns">
            <div className="settings-card">
              <div className="section-heading">
                <TrendingUp />
                <h2>On repeat</h2>
              </div>
              <ol className="stat-list">
                {stats.topTracks.map((entry, position) => {
                  const known = tracks.some((track) => track.id === entry.key);
                  return (
                    <li key={entry.key}>
                      <span className="stat-rank">
                        {String(position + 1).padStart(2, '0')}
                      </span>
                      <Artwork src={entry.artwork} title={entry.label} />
                      <span className="stat-name">
                        <strong>{entry.label}</strong>
                        <small>{entry.detail}</small>
                      </span>
                      <span className="stat-meta">
                        {entry.plays}× · {listeningTime(entry.seconds)}
                      </span>
                      <button
                        className="text-button"
                        disabled={busy || !known}
                        title={
                          known
                            ? 'Play this track again'
                            : 'Save this track to play it from here'
                        }
                        onClick={() => play(entry.key)}
                      >
                        Play
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="settings-card">
              <div className="section-heading">
                <Mic2 />
                <h2>Your artists</h2>
              </div>
              <ol className="stat-list">
                {stats.topArtists.map((entry, position) => (
                  <li key={entry.key}>
                    <span className="stat-rank">
                      {String(position + 1).padStart(2, '0')}
                    </span>
                    <span className="stat-name">
                      <strong>{entry.label}</strong>
                      <small>{entry.plays} plays</small>
                    </span>
                    <span className="stat-bar" aria-hidden="true">
                      <i
                        style={{
                          width: `${Math.round(
                            (entry.seconds /
                              (stats.topArtists[0]?.seconds || 1)) *
                              100,
                          )}%`,
                        }}
                      />
                    </span>
                    <span className="stat-meta">
                      {listeningTime(entry.seconds)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
          <section className="settings-card">
            <div className="section-heading">
              <Clock3 />
              <h2>Recently played</h2>
            </div>
            <ol className="stat-list recent">
              {stats.recent.map((event, position) => (
                <li key={`${event.id}-${event.playedAt}-${position}`}>
                  <Artwork src={event.artwork} title={event.title} />
                  <span className="stat-name">
                    <strong>{event.title}</strong>
                    <small>{event.artist}</small>
                  </span>
                  <span className="stat-meta">
                    {new Date(event.playedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
            <div className="playlist-footer">
              <span className="field-help">
                History stays in {stats.days} day
                {stats.days === 1 ? '' : 's'} of local records on this server.
              </span>
              <button
                className="text-button danger"
                disabled={busy}
                onClick={clear}
              >
                <Trash2 size={15} />
                Clear listening history
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
