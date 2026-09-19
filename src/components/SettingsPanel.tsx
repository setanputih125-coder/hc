import { useEffect, useRef, useState } from 'react';
import {
  AlignLeft,
  AudioLines,
  Check,
  Download,
  ExternalLink,
  LoaderCircle,
  Palette,
  Radio,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Upload,
} from 'lucide-react';
import type { Health, Settings, Theme } from '../../shared/types';
import { MAX_CROSSFADE, PLAYBACK_RATES, THEMES } from '../../shared/settings';
import { EqualizerPanel } from './Equalizer';

const themeNames: Record<Theme, string> = {
  undertone: 'Undertone · moss green',
  noir: 'Noir · monochrome',
  ember: 'Ember · warm amber',
  tide: 'Tide · deep blue',
};

export function SettingsPanel({
  settings,
  health,
  busy,
  audioEngineReady,
  save,
  refresh,
  exportBackup,
  importBackup,
}: {
  settings: Settings;
  health?: Health;
  busy: boolean;
  audioEngineReady: boolean;
  save: (settings: Settings) => Promise<void>;
  refresh: () => void;
  exportBackup: () => void;
  importBackup: (file: File) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(settings), [settings]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h1>Behind the music.</h1>
          <p>One source. Your playlists. Every word that’s available.</p>
        </div>
        <SlidersHorizontal size={28} className="muted" />
      </div>
      <form
        className="settings-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void save(draft);
        }}
      >
        <section className="settings-card">
          <div className="section-heading">
            <Radio />
            <h2>Audio streaming</h2>
          </div>
          <p>
            Search or paste a YouTube link. Your server streams audio directly
            to your browser when you press play.
          </p>
          <div className="connection-row">
            <span>
              <span
                className={`status-light ${health?.available ? '' : 'offline'}`}
              />
              {health?.available
                ? 'Music service connected'
                : 'Music service unavailable'}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Check music connection"
              onClick={refresh}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {health?.message && (
            <div className="notice error">
              <p>{health.message}</p>
            </div>
          )}
          <div className="connection-aids">
            <span className={health?.cookies ? 'aid on' : 'aid'}>
              {health?.cookies ? 'Saved sign-in in use' : 'No saved sign-in'}
            </span>
            <span className={health?.proofOfOrigin ? 'aid on' : 'aid'}>
              {health?.proofOfOrigin
                ? 'Request attestation on'
                : 'Request attestation off'}
            </span>
          </div>
          <p className="field-help">
            If this server is asked to verify itself, these two settings are what
            help. Both are configured on the server with <code>MUSIC_COOKIES</code>{' '}
            and <code>MUSIC_ATTESTATION</code>; see the README. A home or mobile
            connection is rarely challenged and needs neither.
          </p>
          <label>
            Audio format
            <select
              value={draft.audioFormat}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  audioFormat: event.target.value as Settings['audioFormat'],
                })
              }
            >
              <option value="best">
                Best available audio · usually WebM / Opus
              </option>
              <option value="m4a">
                M4A / AAC · wider browser compatibility
              </option>
            </select>
          </label>
          <p className="field-help">
            Applies to the next track load. YouTube audio is already encoded;
            “best” does not mean lossless or the original recording. No
            additional transcoding is performed.
          </p>
          <label>
            Playback speed
            <select
              value={draft.playbackRate}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  playbackRate: Number(event.target.value),
                })
              }
            >
              {PLAYBACK_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}× {rate === 1 ? '· original tempo' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Crossfade between songs
            <input
              type="range"
              min={0}
              max={MAX_CROSSFADE}
              step={1}
              value={draft.crossfadeSeconds}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  crossfadeSeconds: Number(event.target.value),
                })
              }
            />
            <span className="field-value">
              {draft.crossfadeSeconds
                ? `${draft.crossfadeSeconds} second${draft.crossfadeSeconds === 1 ? '' : 's'}`
                : 'Off · gapless switch'}
            </span>
          </label>
          <p className="field-help">
            Crossfade overlaps the end of one song with the start of the next.
            It uses a second audio element, so each track is still streamed on
            demand.
          </p>
          <div className="quality-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Stream, don’t stockpile.</strong>
              <p>
                No audio files are downloaded to disk. HTTP ranges enable
                seeking through the upstream audio stream.
              </p>
            </div>
          </div>
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <AudioLines />
            <h2>Sound shaping</h2>
            <span className="pill">WEB AUDIO</span>
          </div>
          <p>
            Shape the sound in your browser. Nothing is re-encoded and the
            original stream is untouched.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={draft.normalizeVolume}
              disabled={!audioEngineReady}
              onChange={(event) =>
                setDraft({ ...draft, normalizeVolume: event.target.checked })
              }
            />
            Even out loud and quiet songs
          </label>
          <EqualizerPanel
            value={draft.equalizer}
            supported={audioEngineReady}
            onChange={(equalizer) => setDraft({ ...draft, equalizer })}
          />
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <Radio />
            <h2>Radio & history</h2>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={draft.radioEnabled}
              onChange={(event) =>
                setDraft({ ...draft, radioEnabled: event.target.checked })
              }
            />
            Allow endless radio from a song
          </label>
          <p className="field-help">
            Radio asks YouTube for the mix that follows the last song in your
            queue and appends it while you listen.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={draft.historyEnabled}
              onChange={(event) =>
                setDraft({ ...draft, historyEnabled: event.target.checked })
              }
            />
            Keep listening history and statistics
          </label>
          <p className="field-help">
            History is stored only in your server's data directory and powers
            the Listening view. Turning it off stops new entries; clear existing
            ones from that view.
          </p>
          <div className="notice">
            <strong>
              <Timer size={16} /> Sleep timer
            </strong>
            <p>
              Set a sleep timer from the player panel or the command palette
              with <kbd>Ctrl</kbd> + <kbd>K</kbd>.
            </p>
          </div>
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <Palette />
            <h2>Appearance</h2>
          </div>
          <p>Pick the room's lighting. The choice is saved on your server.</p>
          <div className="theme-grid">
            {THEMES.map((theme) => (
              <button
                type="button"
                key={theme}
                className={`theme-swatch ${theme} ${draft.theme === theme ? 'active' : ''}`}
                aria-pressed={draft.theme === theme}
                onClick={() => setDraft({ ...draft, theme })}
              >
                <span className="theme-dots">
                  <i />
                  <i />
                  <i />
                </span>
                {themeNames[theme]}
              </button>
            ))}
          </div>
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <AlignLeft />
            <h2>Online lyrics</h2>
            <span className="pill">LRCLIB</span>
          </div>
          <p>
            Automatically find lyrics by track title, artist, and duration. No
            lyrics folder, uploads, or manual LRC files needed.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={draft.lyricsEnabled}
              onChange={(event) =>
                setDraft({ ...draft, lyricsEnabled: event.target.checked })
              }
            />
            Enable automatic online lyrics
          </label>
          <div className="notice">
            <strong>The right words, at the right time.</strong>
            <p>
              Synced LRC highlights each line and supports click-to-seek. Plain
              lyrics stay untimed. If metadata is ambiguous, choose a matching
              recording in the lyrics panel and adjust its timing offset.
            </p>
          </div>
          <p className="field-help">
            Not every recording has lyrics. Instrumental, missing, and
            unavailable results are shown explicitly. Audio keeps playing if the
            lyrics service is offline.
          </p>
          <a
            className="external-link"
            href="https://lrclib.net"
            target="_blank"
            rel="noreferrer"
          >
            Explore LRCLIB
            <ExternalLink size={14} />
          </a>
        </section>
        <div className="settings-footer">
          <p>
            Preferences, favorites, and playlist metadata are saved on your
            server. Music and lyrics come from online sources.
          </p>
          <button className="primary-button" disabled={busy}>
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}
            Save preferences
          </button>
        </div>
      </form>
      <section className="settings-card">
        <div className="section-heading">
          <Download />
          <h2>Backup & restore</h2>
        </div>
        <p>
          Export saved songs, playlists, and preferences as one JSON file, then
          restore them on another machine — Termux, a laptop, or a deployment.
        </p>
        <div className="backup-actions">
          <button
            type="button"
            className="outline-button"
            onClick={exportBackup}
            disabled={busy}
          >
            <Download size={16} />
            Export backup
          </button>
          <button
            type="button"
            className="outline-button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <Upload size={16} />
            Restore from file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) importBackup(file);
            }}
          />
        </div>
        <p className="field-help">
          Restoring replaces the current saved songs, playlists, and
          preferences. Listening history is not included in the file.
        </p>
      </section>
      <section className="settings-card privacy-note">
        <h2>Your server, connected.</h2>
        <p>
          YouTube receives searches and audio requests from your server. LRCLIB
          receives track metadata and manual lyrics queries. Album thumbnails
          load from YouTube’s image servers. Short-lived stream URLs and lyrics
          responses are cached only in memory; no YouTube cookies, passwords, or
          Google API keys are collected.
        </p>
        <p>
          YouTube changes, regional restrictions, and verification requirements
          can prevent playback. This app does not connect private accounts or
          unlock restricted videos. Browser and Android battery policies control
          how reliably background playback works.
        </p>
        <p>
          For LAN access, configure <code>APP_PASSWORD</code> and{' '}
          <code>PUBLIC_ORIGIN</code>. Use HTTPS outside trusted loopback access.
          Upstream policies:{' '}
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noreferrer"
          >
            YouTube
          </a>{' '}
          ·{' '}
          <a href="https://lrclib.net/docs" target="_blank" rel="noreferrer">
            LRCLIB API
          </a>
          .
        </p>
      </section>
    </>
  );
}
