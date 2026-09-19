# Undertone

A self-hosted music player for YouTube, powered by **yt-dlp** with lyrics from **LRCLIB**.

## Features

- Search music and open YouTube video or playlist links.
- Stream audio with seeking, volume control, shuffle, and repeat.
- Keep listening with **endless radio** built from the YouTube mix of any song.
- Shape the sound with a **10-band equalizer**, volume normalization, crossfade, and playback speed.
- Organize favorites, playlists, and the playback queue.
- Follow timed lyrics, choose a recording, and save timing corrections.
- See what you actually play in **Listening**: top tracks, artists, and time listened.
- Reach everything from the **command palette** (`Ctrl`/`Cmd` + `K`) and keyboard shortcuts.
- Pick a theme, set a sleep timer, and resume where you left off after a reload.
- Install it to a phone home screen and back up your collection to a single file.
- Listen through a responsive interface with browser media controls.

## Installation

### Termux

Run these commands inside Termux:

```sh
pkg update -y
pkg install -y git
cd "$HOME"
git clone https://github.com/setanputih125-coder/hc.git
cd hc
bash scripts/termux-setup.sh
npm start
```

Open **http://127.0.0.1:3000** in your browser. Keep the project in Termux's home directory so executables and dependencies work correctly.

For longer listening sessions, run `termux-wake-lock` and keep Termux active. Release the lock with `termux-wake-unlock` when finished. Android battery settings can affect background playback.

Add Undertone to your Android home screen from your browser's menu to open it without browser chrome. The installed shell caches only the interface; music, lyrics, and your collection always come from your running server.

### Linux / macOS

Requirements: **Node.js 22.12+**, **Python 3.10+** with `venv`, and **pip**.

```sh
git clone https://github.com/setanputih125-coder/hc.git
cd hc
bash scripts/setup.sh
npm start
```

Open **http://127.0.0.1:3000**. Setup installs the pinned Python packages in `.venv`, installs Node dependencies, and builds the application.

## Listening

Search for a song or paste a YouTube link, then select a track. Use the heart to save a favorite and the playlist button to organize your collection.

Paste any YouTube list link and Undertone opens it and starts playing: ordinary playlists, and the generated mixes whose links look like `youtube.com/playlist?list=RD…`. A `watch?v=…&list=…` link opens the list and starts at that song. YouTube serves mixes only from the watch URL, so Undertone requests them that way.

**Settings → Audio format** offers Best available audio and M4A / AAC. Choose M4A if your browser has trouble playing WebM / Opus. Changes apply when a track is loaded.

### Radio

The radio tower button beside a track, in the player panel, or in the command palette starts an endless mix. Undertone asks YouTube for the mix that follows a song and appends new tracks to your queue as you approach the end. Turn it off in **Settings → Radio & history**.

### Sound shaping

**Settings → Sound shaping** adds a 10-band equalizer with presets, a preamp, and optional volume normalization. Both use the browser's Web Audio graph: nothing is re-encoded and the upstream stream is untouched. If a browser does not expose Web Audio, the controls are disabled and playback continues unchanged.

Crossfade and playback speed live in **Settings → Audio streaming**. Crossfade overlaps the end of one song with the start of the next using a second audio element, so each track is still streamed on demand.

### Listening statistics

**Listening** shows your top tracks, artists, time listened, and recent plays. A play is counted after 20 seconds and stored only in your server's data directory. Turn history off or clear it from that view.

### Keyboard and the command palette

Press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>K</kbd> for the command palette: playback, sleep timers, themes, views, playlists, and backups. Other shortcuts, active when you are not typing:

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | Play or pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Seek 10 seconds |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Volume |
| <kbd>N</kbd> / <kbd>P</kbd> | Next / previous track |
| <kbd>S</kbd> / <kbd>R</kbd> | Shuffle / repeat |
| <kbd>L</kbd> / <kbd>Q</kbd> | Lyrics / queue panel |
| <kbd>M</kbd> | Mute |
| <kbd>/</kbd> | Focus search |

### Backup and restore

**Settings → Backup & restore** exports saved songs, playlists, and preferences as one JSON file and restores it on another machine. Restoring replaces the current collection; listening history is not included.

### Lyrics

Open the lyrics panel from the player. Timed lyrics highlight the current line; clicking a line seeks to its position. Plain lyrics are displayed as text.

If timing needs adjustment:

1. Choose **Align a line to the audio**.
2. Click the line as you hear it begin. This adjusts the lyrics while keeping audio in place.
3. Fine-tune with **Lyrics too early** or **Lyrics too late**.

Recording choices and offsets are remembered per video and lyrics version in your browser. **Reset offset** clears the correction; **Use automatic match** returns to automatic selection.

Lyrics availability and timestamp accuracy depend on the recording. Use **Find another version** when the arrangement differs or timing drifts throughout the song.

Automatic matching and **Find lyrics** only use recordings with the same displayed duration as the player: a **4:00** song shows **4:00** results, not **3:59** or **4:01**. Fractions within the same displayed second are accepted. If no recording matches, the results stay empty. Lyrics search waits until the track duration is known.

## Deploy on Railway

Use the included **Dockerfile** and **`.railway/railway.ts`** template to run Undertone with persistent storage, password-protected access, and a deployment healthcheck.

Follow the [Railway deployment guide](docs/railway.md) for browser-based setup, template commands, required variables, and publishing a one-click template from your account.

## Configuration

To customize the server, copy `.env.example` to `.env`:

```sh
cp .env.example .env
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `./data` | Favorites, playlists, and preferences |
| `PYTHON_BIN` | `.venv/bin/python`, then `python3` | Python executable |
| `APP_PASSWORD` | Unset | Server password |
| `PUBLIC_ORIGIN` | Unset | Permitted browser origin for LAN or proxy access |
| `TRUST_PROXY` | Unset | Trusted proxy hops, such as `1` behind one reverse proxy |

For LAN access, set `HOST=0.0.0.0`, a strong `APP_PASSWORD`, and `PUBLIC_ORIGIN` to the address you open in your browser, such as `http://192.168.1.50:3000`. Both password and origin are required when binding beyond loopback. Use HTTPS for remote access.

Set `TRUST_PROXY` only when a reverse proxy you control sits in front of Undertone. It makes the login rate limit count each client separately and marks session cookies `Secure` on forwarded HTTPS requests. Leave it unset for direct connections, where forwarded headers cannot be trusted.

## Development

```sh
npm run dev
```

The development app runs at **http://127.0.0.1:5173**.

```sh
npm run check
npm test
npm run build
```

| Directory | Contents |
| --- | --- |
| `src/` | React interface and audio player |
| `server/` | Express API, yt-dlp integration, streaming, and LRCLIB client |
| `shared/` | Types, settings, statistics, queue ordering, and lyric timing utilities |
| `tests/` | Provider, streaming, persistence, timing, and feature tests |
| `scripts/` | Setup, development, build, and test commands |

## Compatibility

Playback depends on YouTube availability, extractor compatibility, and browser codec support. LRCLIB provides lyric coverage and recording timestamps. The application connects to these services for music, artwork, and lyrics.

Builds and automated tests are verified on Linux. Installation and background playback on physical Android devices still need device testing. Integration references and verification details are in [docs/research.md](docs/research.md).
