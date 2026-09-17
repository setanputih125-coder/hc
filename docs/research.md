# Research and verification — online-only Undertone

Checked against upstream material on **17 September 2026**. The current requested architecture is yt-dlp-only music with online lyrics; the earlier official-client/local-library design is no longer active.

## Confirmed upstream facts

| Area | Confirmed behavior | Source |
| --- | --- | --- |
| Extractor release | The installed pinned release is yt-dlp `2026.08.19`; PyPI package version `2026.8.19` requires Python 3.10+. | [PyPI metadata](https://pypi.org/pypi/yt-dlp/json), `python -m yt_dlp --version` |
| EJS | yt-dlp-ejs `0.8.0` requires Python 3.10+. Full YouTube support uses an external JavaScript runtime and EJS scripts. | [EJS setup](https://github.com/yt-dlp/yt-dlp/wiki/EJS), [PyPI](https://pypi.org/pypi/yt-dlp-ejs/json) |
| JavaScript runtime | Current EJS documentation lists Node 22+ and requires explicit `--js-runtimes node`; only Deno is enabled by default. Undertone passes its actual Node executable path. | [EJS runtime instructions](https://github.com/yt-dlp/yt-dlp/wiki/EJS) |
| Metadata extraction | `--dump-single-json` emits playlist/video metadata without downloading media by default; `--flat-playlist` avoids resolving every item. Flat entries may lack metadata. | [yt-dlp README](https://github.com/yt-dlp/yt-dlp#usage-and-options) |
| Configuration isolation | `--ignore-config`, `--no-plugin-dirs`, and `--no-remote-components` disable inherited configuration, plugins, and fetching additional runtime components. Locally installed EJS remains available. | [yt-dlp options](https://github.com/yt-dlp/yt-dlp#general-options) |
| Search and playlists | yt-dlp supports `ytsearch` prefixes, YouTube playlist extraction, and playlist start/end selection. Pagination in this app is implemented using those bounded selections. | [yt-dlp README](https://github.com/yt-dlp/yt-dlp), live searches |
| Format selection | Format selectors support `bestaudio` and filters for extension/protocol. YouTube exposes already encoded formats, not original studio masters. | [Format selection](https://github.com/yt-dlp/yt-dlp#format-selection) |
| LRCLIB access | No registration/API key is needed. Clients must identify themselves with User-Agent or an allowed alternative header, serialize requests, add a 200–500 ms gap, and honor 429 Retry-After. | [Current LRCLIB API documentation](https://lrclib.net/docs), rendered documentation |
| Exact lyrics lookup | `/api/get` takes title, artist, album, and duration. Documentation states duration must match within ±2 seconds; this endpoint can consult external sources when its own database does not have the signature. | [LRCLIB docs](https://lrclib.net/docs) |
| Lyrics search | `/api/search` accepts either `q` or structured title/artist/album fields. `q` takes precedence. Current documentation says at most 20 results, with no pagination. | [LRCLIB docs](https://lrclib.net/docs), rendered search section |
| Lyrics records | `/api/get/:id` retrieves a record. Responses include syncedLyrics, plainLyrics, duration, instrumental, and recording metadata. New Lyricsfile fields also exist; Undertone consumes the backward-compatible LRC/plain fields. | [LRCLIB docs](https://lrclib.net/docs) |
| Termux packages | Current source package definitions include `nodejs-lts`, `npm`, `python`, and `python-pip`. Node LTS recommends the separate npm package. | [Node LTS package](https://github.com/termux/termux-packages/blob/master/packages/nodejs-lts/build.sh), [npm](https://github.com/termux/termux-packages/blob/master/packages/npm/build.sh), [pip](https://github.com/termux/termux-packages/blob/master/packages/python-pip/build.sh) |
| Browser media controls | Media Session is optional browser functionality; hardware/lock-screen support differs by browser/platform. It does not override Android process/battery policies. | [Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API) |

The older `get-cached` endpoint is not relied upon: it was absent from the currently rendered LRCLIB documentation during this check. Current documented `/api/get`, `/api/search`, and `/api/get/:id` are used directly.

## Deliberate implementation choices, not upstream promises

- Two concurrent extractors, 12 waiting operations, four concurrent streams, 20-result catalog pages, 200 search results, 1,000 playlist/queue entries, and three-minute metadata/stream caches are **application limits**.
- Live, upcoming, private, and explicitly restricted entries are rejected when that metadata is available. Flat results can lack availability details; final resolution can still fail.
- Audio stays in its upstream WebM/Opus or M4A/AAC representation. There is no transcoding, media-file cache, or FFmpeg requirement. HTTP range forwarding is not a guarantee that every future upstream format will remain seekable.
- Only HTTPS Googlevideo subdomains are permitted for media URLs and redirects. This is a fail-closed containment choice; future CDN changes could require a reviewed update rather than silently allowing arbitrary URLs.
- Title splitting (`Artist - Song`) only produces lyric-search hints. Automatic lyrics require matching artist/title and duration; ambiguous results are not assigned invented confidence.
- LRC has no single governing standard. This parser uses positive `[offset]` to display lines earlier, supports line timestamps, and strips enhanced word timestamps. It does not implement word-level highlighting, translations, or romanization.
- Lyrics are loaded when the lyrics panel is used, not by scanning an entire catalog. Responses are cached in memory for at most 24 hours and requests have a 350 ms gap.
- No Google account, cookies, credentials, private playlists, DRM unlocks, verification workarounds, or OAuth integration are implemented.
- This is a private self-hosted application, not an official YouTube API client or a representation that YouTube endorses extraction. Upstream availability and access policies remain external constraints.

## Verification evidence

### Automated

`npm run check`, `npm test`, and `npm run build` cover:

- TypeScript consistency and production frontend compilation.
- Safe argument-array extraction, configuration isolation, bounded pagination, cache coalescing, audio format choices, and cookie/header filtering.
- Real HTTP server behavior with simulated upstream bytes: exact range payloads, full requests, HEAD, suffix/open ranges, stale If-Range, multipart fallback, 416, and one refresh after an expired URL.
- Redirect/host containment, session authentication, cross-site rejection, metadata-only resolve responses, atomic favorites/playlists, and no local-media endpoints.
- LRCLIB client identity, sequential requests, caching, Retry-After, exact versus ambiguous matching, manual selection, missing/error states, instrumental/plain lyrics, and LRC seek/offset behavior.

All committed lyric fixtures are original test phrases. Automated provider tests do not require a real account or copy third-party songs into the repository.

### Live checks

- Installed yt-dlp/EJS successfully resolved the public YouTube developer documentation example to HTTPS WebM/Opus audio. Only safe format metadata was printed; the signed URL was not exposed in reports or source.
- The actual application retrieved live YouTube search results and played a Judy Collins recording of the public-domain hymn “Amazing Grace” through the server's audio proxy. Browser playback time advanced and the extracted duration/codec were populated.
- The initial LRCLIB search correctly exposed multiple recording candidates rather than auto-selecting an ambiguous version. Exact artist/title/album/duration lookup was then checked against the live documented endpoint and returned a synced record for the same recording.
- A fresh browser run automatically matched that recording to 25 synchronized lines. Clicking one line sought to 94.9 seconds at zero offset and 92.9 seconds at a +2-second offset, with exactly one active line.
- Manual lyrics search returned 20 versions. The version picker initially overlapped the scrolling lyrics; the picker now replaces the lyrics display while open and suspends automatic scrolling. Selecting a version succeeded during playback on desktop and at a 390-pixel viewport.
- Real playback succeeded with both Best/WebM and M4A settings. Pause, shuffle/repeat toggles, queue reorder/removal, saved-song and playlist persistence after reload, and the online-lyrics-off state were checked through the running UI. Plain/instrumental and provider-error contracts remain automated checks rather than claims of live coverage for every state.
- The 390-pixel home and lyrics views measured a 390-pixel document width, with no horizontal overflow. This is desktop Chrome viewport testing, not an Android-device test.
- The development backend now uses `tsx watch server/index.ts` rather than compiled output. A clean production build completed while the development API stayed responsive. Managed Preview initially returned historical crash logs; a fresh process and subsequent HTTP/browser checks confirmed recovery.
- The checked-in setup command ran successfully in this Linux sandbox. The managed setup tool itself reported a lifecycle-claim block; the identical effective command was verified directly with `bash scripts/setup.sh` rather than claiming the blocked platform operation ran.

### Synchronization follow-up — 17 September 2026

- Reproduced a browser bug: an offset of −2 seconds became zero after closing and reopening the lyrics panel. Manual record selection was also panel-local. Choices and corrections now survive panel remounts/reloads, keyed separately by video and LRCLIB record.
- The parser groups simultaneous timestamps into one selectable cue. Millisecond comparisons and inverse seek calculations prevent a floating-point boundary from selecting the preceding line. Media position updates wait for a settled seek instead of displaying only the requested position.
- Flat search results can no longer overwrite resolved recording metadata used for matching. The UI identifies the lyric recording and distinguishes a metadata match from verified audio alignment.
- New **Align a line to the audio** mode adjusts the lyric offset without seeking. In a real-audio browser test, a cue at 13.42 seconds was deliberately aligned to audio position 30 seconds: the offset became −16.58 and audio stayed at 30. Subsequent forward/backward clicks reached actual audio positions 76.6 → 30 → 53.29 → 30 seconds, with the clicked cue active each time. This verifies the calibration/seek mechanism, not that the deliberately chosen offset is correct for that song.
- The −16.58 test correction and chosen record survived a panel reopen and full page reload. UI checks also cover mobile containment; provider-error, duplicate-timestamp, cross-video/version isolation and storage-failure paths have regression tests. The suite now contains 32 passing tests.
- Rapid forward/backward line clicks during real playback settled on the last selected cue: its timestamp was 36.71 seconds, actual audio time was 36.746 seconds after resuming, and that cue remained active. Test corrections were reset to zero afterward. At 390×667, the scrollable lyrics panel ended above the player instead of covering it; the 390×844 layout also stayed within the viewport width.
- The specific recording reported as out of sync has not been supplied. A constant offset cannot fix a different recording or progressive timing drift, and this app does not claim acoustic/ASR alignment of arbitrary provider lyrics.

### Still needs physical-device / ongoing testing

- Installation from scratch on actual Termux architectures, including the Android esbuild binary and virtual-environment/pip behavior.
- Android browser codec support, audio focus interruptions, Bluetooth/headset controls, lock-screen actions, battery optimization, and app/background process survival.
- Region-specific and verification-blocked YouTube networks. A datacenter network working in one live check is not a universal availability guarantee.
- Future yt-dlp/EJS compatibility after YouTube changes. Update pinned versions deliberately, rebuild, and rerun the suite rather than promising permanent support.
- LRCLIB coverage and lyric timing for arbitrary recordings, remasters, live versions, translations, and entries without trustworthy music tags.
