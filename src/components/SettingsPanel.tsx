import { useEffect, useState } from 'react';
import {
  AlignLeft,
  Check,
  ExternalLink,
  LoaderCircle,
  Radio,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import type { Health, Settings } from '../../shared/types';

export function SettingsPanel({
  settings,
  health,
  busy,
  save,
  refresh,
}: {
  settings: Settings;
  health?: Health;
  busy: boolean;
  save: (settings: Settings) => Promise<void>;
  refresh: () => void;
}) {
  const [draft, setDraft] = useState(settings);
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
            <h2>YouTube · yt-dlp</h2>
            <span className="pill">NO API KEY</span>
          </div>
          <p>
            Search or paste a YouTube link. Your server resolves an on-demand
            audio stream using yt-dlp and sends its original bytes to your
            browser.
          </p>
          <div className="connection-row">
            <span>
              <span
                className={`status-light ${health?.available ? '' : 'offline'}`}
              />
              {health?.available
                ? `yt-dlp ${health.version}`
                : 'Extractor unavailable'}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Check extractor status"
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
          <a
            className="external-link"
            href="https://github.com/yt-dlp/yt-dlp"
            target="_blank"
            rel="noreferrer"
          >
            yt-dlp project and updates
            <ExternalLink size={14} />
          </a>
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
          yt-dlp is an independent integration, not the official YouTube API.
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
