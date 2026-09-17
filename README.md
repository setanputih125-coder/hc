# Undertone

A self-hosted music player for YouTube, powered by **yt-dlp** with lyrics from **LRCLIB**.

## Features

- Search music and open YouTube video or playlist links.
- Stream audio with seeking, volume control, shuffle, and repeat.
- Organize favorites, playlists, and the playback queue.
- Follow timed lyrics, choose a recording, and save timing corrections.
- Listen through a responsive interface with browser media controls.

## Installation

### Termux

Run these commands inside Termux:

```sh
pkg update -y
pkg install -y git
cd "$HOME"
git clone https://github.com/setanputih152-afk/hc.git
cd hc
bash scripts/termux-setup.sh
npm start
```

Open **http://127.0.0.1:3000** in your browser. Keep the project in Termux's home directory so executables and dependencies work correctly.

For longer listening sessions, run `termux-wake-lock` and keep Termux active. Release the lock with `termux-wake-unlock` when finished. Android battery settings can affect background playback.

### Linux / macOS

Requirements: **Node.js 22.12+**, **Python 3.10+** with `venv`, and **pip**.

```sh
git clone https://github.com/setanputih152-afk/hc.git
cd hc
bash scripts/setup.sh
npm start
```

Open **http://127.0.0.1:3000**. Setup installs the pinned Python packages in `.venv`, installs Node dependencies, and builds the application.

## Listening

Search for a song or paste a YouTube link, then select a track. Use the heart to save a favorite and the playlist button to organize your collection.

**Settings → Audio format** offers Best available audio and M4A / AAC. Choose M4A if your browser has trouble playing WebM / Opus. Changes apply when a track is loaded.

### Lyrics

Open the lyrics panel from the player. Timed lyrics highlight the current line; clicking a line seeks to its position. Plain lyrics are displayed as text.

If timing needs adjustment:

1. Choose **Align a line to the audio**.
2. Click the line as you hear it begin. This adjusts the lyrics while keeping audio in place.
3. Fine-tune with **Lyrics too early** or **Lyrics too late**.

Recording choices and offsets are remembered per video and lyrics version in your browser. **Reset offset** clears the correction; **Use automatic match** returns to automatic selection.

Lyrics availability and timestamp accuracy depend on the recording. Use **Find another version** when the arrangement differs or timing drifts throughout the song.

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

For LAN access, set `HOST=0.0.0.0`, a strong `APP_PASSWORD`, and `PUBLIC_ORIGIN` to the address you open in your browser, such as `http://192.168.1.50:3000`. Both password and origin are required when binding beyond loopback. Use HTTPS for remote access.

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
| `shared/` | Types, queue ordering, and lyric timing utilities |
| `tests/` | Provider, streaming, persistence, and timing tests |
| `scripts/` | Setup, development, build, and test commands |

## Compatibility

Playback depends on YouTube availability, extractor compatibility, and browser codec support. LRCLIB provides lyric coverage and recording timestamps. The application connects to these services for music, artwork, and lyrics.

Builds and automated tests are verified on Linux. Installation and background playback on physical Android devices still need device testing. Integration references and verification details are in [docs/research.md](docs/research.md).
