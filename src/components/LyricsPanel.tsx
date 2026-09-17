import { useEffect, useRef, useState } from 'react';
import {
  AlignLeft,
  ArrowDown,
  ExternalLink,
  LoaderCircle,
  Search,
} from 'lucide-react';
import type { LyricCandidate, Lyrics, Track } from '../../shared/types';
import { activeLyric, lyricOffset, lyricSeekTime } from '../../shared/lyrics';
import {
  LyricPreferences,
  maxLyricOffset,
} from '../../shared/lyric-preferences';
import { api } from '../api';
import { timeLabel } from './PlayerBar';

export function LyricsPanel({
  track,
  position,
  duration,
  getPosition,
  seek,
  loading: resolving,
  enabled,
}: {
  track?: Track;
  position: number;
  duration: number;
  getPosition: () => number;
  seek: (time: number) => void;
  loading: boolean;
  enabled: boolean;
}) {
  const [lyrics, setLyrics] = useState<Lyrics>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<LyricCandidate[]>([]);
  const [offset, setOffset] = useState(0);
  const [follow, setFollow] = useState(true);
  const [retry, setRetry] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [manual, setManual] = useState(false);
  const [preferences] = useState(() => {
    try {
      return new LyricPreferences(window.localStorage);
    } catch {
      return new LyricPreferences();
    }
  });
  const currentLine = useRef<HTMLButtonElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | undefined>(undefined);
  const active = activeLyric(lyrics?.lines ?? [], position + offset);
  const searchDuration =
    Number.isFinite(duration) && duration > 0
      ? Math.floor(duration)
      : undefined;

  useEffect(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLyrics(undefined);
    setCandidates([]);
    setError('');
    setOffset(0);
    setFollow(true);
    setFindOpen(false);
    setCalibrating(false);
    const selected = track ? preferences.selected(track.id) : undefined;
    setManual(selected !== undefined);
    setQuery(
      track
        ? `${track.lyricsArtist ?? ''} ${track.lyricsTitle || track.title}`.trim()
        : '',
    );
    if (!track || resolving || !enabled) {
      setLoading(false);
      return;
    }
    if (!searchDuration) {
      setLoading(false);
      setFindOpen(true);
      return;
    }
    setLoading(true);
    api<Lyrics>(
      selected
        ? `/api/lyrics/${selected}`
        : `/api/tracks/${track.id}/lyrics?duration=${searchDuration}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setLyrics(result);
        setOffset(
          result.recordId ? preferences.offset(track.id, result.recordId) : 0,
        );
        setCandidates(result.candidates ?? []);
        setFindOpen(
          !result.lines.length && !result.plain && !result.instrumental,
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => request.current?.abort();
  }, [track?.id, resolving, enabled, retry, searchDuration]);
  useEffect(() => {
    const line = currentLine.current;
    const container = scrollArea.current;
    if (follow && !findOpen && !calibrating && line && container)
      container.scrollTo({
        top: line.offsetTop - (container.clientHeight - line.offsetHeight) / 2,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      });
  }, [active, follow, findOpen, calibrating, lyrics?.recordId]);

  function stopFollowing() {
    setFollow(false);
    const container = scrollArea.current;
    container?.scrollTo({ top: container.scrollTop, behavior: 'instant' });
  }

  function changeOffset(value: number) {
    if (!Number.isFinite(value) || !track || !lyrics?.recordId) return;
    const next =
      Math.round(
        Math.max(-maxLyricOffset, Math.min(maxLyricOffset, value)) * 1000,
      ) / 1000;
    setOffset(next);
    preferences.setOffset(track.id, lyrics.recordId, next);
  }

  function clickLine(time: number) {
    if (loading || resolving) return;
    if (calibrating) {
      const value = lyricOffset(time, getPosition());
      if (!Number.isFinite(value) || Math.abs(value) > maxLyricOffset) {
        setError(
          'Cannot align this line here. Wait for seeking to finish or choose the matching recording.',
        );
        return;
      }
      changeOffset(value);
      setCalibrating(false);
      setError('');
    } else seek(lyricSeekTime(time, offset));
    setFollow(true);
  }

  function automatic() {
    if (!track) return;
    preferences.select(track.id);
    setRetry((value) => value + 1);
  }

  async function search() {
    if (!searchDuration || resolving) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    setCandidates([]);
    try {
      const results = await api<LyricCandidate[]>(
        `/api/lyrics/search?q=${encodeURIComponent(query.trim())}&duration=${searchDuration}`,
        'GET',
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setCandidates(results);
        setFindOpen(true);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  async function choose(id: number) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await api<Lyrics>(
        `/api/lyrics/${id}`,
        'GET',
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setLyrics(result);
        setFindOpen(false);
        if (track) {
          preferences.select(track.id, id);
          setOffset(preferences.offset(track.id, id));
        }
        setManual(true);
        setCalibrating(false);
        setFollow(true);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <div className="lyrics-panel">
      <div className="panel-heading">
        <AlignLeft size={21} />
        <h2>Lyrics</h2>
        <span className="pill">LRCLIB</span>
      </div>
      {!track ? (
        <div className="empty-small">
          <AlignLeft />
          <h3>A song comes first.</h3>
          <p>Choose music and its online lyrics will appear here.</p>
        </div>
      ) : !enabled ? (
        <div className="empty-small">
          <AlignLeft />
          <h3>Online lyrics are off.</h3>
          <p>Enable automatic lyrics in Settings to connect to LRCLIB.</p>
        </div>
      ) : (
        <>
          <div className="lyrics-source">
            <span>
              {lyrics?.instrumental
                ? 'Instrumental'
                : lyrics?.lines.length
                  ? 'Timed lyrics · LRCLIB timestamps'
                  : lyrics?.plain
                    ? 'Plain lyrics · no timing available'
                    : 'Online lyrics lookup'}
            </span>
            <button
              className="text-button"
              onClick={() => {
                setFindOpen(!findOpen);
                setCalibrating(false);
              }}
            >
              {findOpen ? 'Close search' : 'Find another version'}
            </button>
          </div>
          {lyrics?.record && (
            <div className="lyrics-record">
              <strong>
                {lyrics.record.artist} · {lyrics.record.title}
              </strong>
              <span>
                {lyrics.record.album} · {timeLabel(lyrics.record.duration)}
              </span>
              {track.duration > 0 &&
                Math.abs(lyrics.record.duration - track.duration) > 2 && (
                  <span className="lyrics-mismatch">
                    Different duration from this video (
                    {timeLabel(track.duration)}). This version may not line up;
                    an offset cannot fix a different arrangement.
                  </span>
                )}
            </div>
          )}
          {manual && (
            <button
              className="text-button lyrics-auto"
              onClick={automatic}
              disabled={loading || resolving}
            >
              Use automatic match
            </button>
          )}
          {(loading || resolving) && (
            <div className="loading-line">
              <LoaderCircle size={16} className="spin" />
              {resolving ? 'Waiting for track details…' : 'Finding the words…'}
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              <p>{error}</p>
              <button
                className="text-button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Retry lyrics
              </button>
            </div>
          )}
          {findOpen && (
            <div className="lyrics-finder">
              <p className="field-help" role="status">
                {searchDuration
                  ? `Only recordings with duration ${timeLabel(searchDuration)} are shown (same displayed second).`
                  : 'The track duration is not available yet. Lyrics search needs a known duration.'}
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void search();
                }}
              >
                <label>
                  Artist and song title
                  <input
                    aria-label="Search online lyrics"
                    value={query}
                    maxLength={200}
                    required
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <button
                  className="outline-button"
                  disabled={
                    loading || resolving || !query.trim() || !searchDuration
                  }
                >
                  <Search size={15} />
                  Find lyrics
                </button>
              </form>
              {candidates.length > 0 ? (
                <>
                  <p className="field-help">
                    Choose the matching recording. Different versions can have
                    different timings.
                  </p>
                  <div className="lyrics-candidates">
                    {candidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        className="lyrics-candidate"
                        onClick={() => choose(candidate.id)}
                        disabled={loading}
                        aria-label={`Use lyrics for ${candidate.title} by ${candidate.artist}`}
                      >
                        <strong>{candidate.title}</strong>
                        <span>
                          {candidate.artist} · {timeLabel(candidate.duration)}
                        </span>
                        <small>
                          {candidate.album} ·{' '}
                          {candidate.instrumental
                            ? 'Instrumental'
                            : candidate.synced
                              ? 'Synced'
                              : 'Plain text'}
                        </small>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                !loading && !error && !!searchDuration && (
                  <p className="field-help">
                    No lyrics found for {timeLabel(searchDuration)}. Try a
                    cleaner song title and artist name. Other durations are not
                    shown.
                  </p>
                )
              )}
            </div>
          )}
          {!findOpen && !!lyrics?.lines.length && (
            <>
              <div className="lyrics-timing">
                <label>
                  Timing offset{' '}
                  <input
                    aria-label="Lyrics timing offset"
                    type="number"
                    min={-maxLyricOffset}
                    max={maxLyricOffset}
                    step={0.001}
                    value={offset}
                    onChange={(event) =>
                      changeOffset(Number(event.target.value))
                    }
                  />{' '}
                  s
                </label>
                <button
                  className="text-button"
                  onClick={() => setFollow(true)}
                  disabled={follow || calibrating}
                >
                  <ArrowDown size={13} />
                  Follow
                </button>
              </div>
              <div className="lyrics-sync-actions">
                <button
                  className="text-button"
                  onClick={() => changeOffset(offset - 0.5)}
                  disabled={loading || resolving || offset <= -maxLyricOffset}
                >
                  Lyrics too early −0.5s
                </button>
                <button
                  className="text-button"
                  onClick={() => changeOffset(offset + 0.5)}
                  disabled={loading || resolving || offset >= maxLyricOffset}
                >
                  Lyrics too late +0.5s
                </button>
                <button
                  className="text-button"
                  aria-pressed={calibrating}
                  disabled={loading || resolving}
                  onClick={() => {
                    setCalibrating(!calibrating);
                    if (calibrating) setFollow(true);
                    else stopFollowing();
                  }}
                >
                  {calibrating
                    ? 'Cancel alignment'
                    : 'Align a line to the audio'}
                </button>
                <button
                  className="text-button"
                  onClick={() => changeOffset(0)}
                  disabled={offset === 0}
                >
                  Reset offset
                </button>
              </div>
              {calibrating && (
                <p className="lyrics-sync-help" role="status">
                  At the start of the line you hear, click that line below. Only
                  the lyrics move; audio will not seek.
                </p>
              )}
              <div
                className={`lyrics-scroll ${calibrating ? 'aligning' : ''}`}
                ref={scrollArea}
                onPointerDown={stopFollowing}
                onWheel={stopFollowing}
                onTouchMove={stopFollowing}
              >
                {lyrics.lines.map((line, index) => (
                  <button
                    key={`${line.time}-${index}`}
                    ref={index === active ? currentLine : undefined}
                    className={`lyric-line ${index === active ? 'active' : ''} ${index < active ? 'past' : ''}`}
                    aria-current={index === active ? 'true' : undefined}
                    data-time={line.time}
                    disabled={loading || resolving}
                    onClick={() => clickLine(line.time)}
                  >
                    {line.text || '♪'}
                  </button>
                ))}
              </div>
              <p className="lyrics-caption">
                {lyrics.matched
                  ? 'Metadata match, not verified against the audio.'
                  : 'Manually selected recording.'}{' '}
                {calibrating
                  ? 'Click a line to align, not seek.'
                  : 'Click a line to seek using your correction.'}{' '}
                Positive = earlier; negative = later. Saved per video/version in
                this browser when storage is available.
              </p>
            </>
          )}
          {!findOpen && !lyrics?.lines.length && lyrics?.plain && (
            <div className="plain-lyrics">{lyrics.plain}</div>
          )}
          {!findOpen && lyrics?.instrumental && (
            <div className="empty-small">
              <AlignLeft />
              <h3>Let the music speak.</h3>
              <p>LRCLIB marks this recording as instrumental.</p>
            </div>
          )}
          {!loading &&
            !resolving &&
            !error &&
            lyrics &&
            !lyrics.plain &&
            !lyrics.lines.length &&
            !lyrics.instrumental &&
            !findOpen && (
              <div className="empty-small">
                <h3>No lyrics for this version.</h3>
                <p>Try another match using the search above.</p>
              </div>
            )}
          {lyrics?.recordId && (
            <a
              className="lyrics-attribution"
              href="https://lrclib.net"
              target="_blank"
              rel="noreferrer"
            >
              Lyrics from LRCLIB
              <ExternalLink size={12} />
            </a>
          )}
        </>
      )}
    </div>
  );
}
