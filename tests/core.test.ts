import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRange } from '../server/range.js';
import { activeLyric, parseLyrics } from '../shared/lyrics.js';
import { nextInQueue, queueOrder } from '../shared/queue.js';
import { mixSeed, youtubeLink } from '../shared/youtube.js';
import { extractorError, mediaUrl, normalizeTrack } from '../server/ytdlp.js';
import { exactLyrics } from '../server/lyrics.js';

test('range fixtures cover bounded, open, suffix, clamped, invalid and multipart requests', () => {
  assert.deepEqual(parseRange('bytes=0-0', 100), { start: 0, end: 0 });
  assert.deepEqual(parseRange('bytes=15-', 100), { start: 15, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-200', 100), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=10-1000', 100), { start: 10, end: 99 });
  for (const value of [
    'bytes=100-',
    'bytes=-0',
    'bytes=20-10',
    'bytes=-',
    'bytes=1-a',
    'bytes=999999999999999999999-',
  ])
    assert.equal(parseRange(value, 100), 'invalid');
  assert.equal(parseRange('bytes=0-', 0), 'invalid');
  assert.equal(parseRange('bytes=0-1,5-6', 100), undefined);
  assert.equal(parseRange('items=1-5', 100), undefined);
});

test('LRC handles BOM, repeated timestamps, precision, offsets, blanks and seek-back lookup', () => {
  const lyrics = parseLyrics(
    '\uFEFF[ar:Test]\r\n[00:20.125][00:05.50]Again\n[00:10]Once\n[00:30.00]\n[offset:+500]',
  );
  assert.deepEqual(lyrics.lines, [
    { time: 5, text: 'Again' },
    { time: 9.5, text: 'Once' },
    { time: 19.625, text: 'Again' },
    { time: 29.5, text: '' },
  ]);
  assert.equal(activeLyric(lyrics.lines, 4), -1);
  assert.equal(activeLyric(lyrics.lines, 9.5), 1);
  assert.equal(activeLyric(lyrics.lines, 30), 3);
  assert.equal(activeLyric(lyrics.lines, 6), 0);
  assert.equal(
    parseLyrics('[offset:-1000]\n[00:02.2]Later').lines[0].time,
    3.2,
  );
  assert.equal(lyrics.origin, 'lrclib');
});

test('plain lyrics never receive invented timestamps and enhanced tags retain line-level text', () => {
  assert.deepEqual(parseLyrics('Original test words\nNo clock').lines, []);
  assert.equal(
    parseLyrics('[00:10.00]<00:10.00>Hello <00:11.00>there').lines[0].text,
    'Hello there',
  );
  assert.deepEqual(parseLyrics('[00:99]Invalid timestamp').lines, []);
});

test('only official YouTube URL shapes and video IDs enter the extractor', () => {
  for (const value of [
    'abcdefghijk',
    'https://youtu.be/abcdefghijk',
    'https://www.youtube.com/watch?v=abcdefghijk',
    'https://m.youtube.com/shorts/abcdefghijk',
    'https://music.youtube.com/watch?v=abcdefghijk',
  ])
    assert.equal(youtubeLink(value)?.videoId, 'abcdefghijk');
  assert.equal(
    youtubeLink('https://youtube.com/playlist?list=PLabcdefghijk')?.playlistId,
    'PLabcdefghijk',
  );
  for (const value of [
    'https://youtube.com.evil.example/watch?v=abcdefghijk',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://example.com/abcdefghijk',
  ])
    assert.equal(youtubeLink(value), undefined);
});

test('generated mixes are recognized by their seed while ordinary playlists are not', () => {
  const link = youtubeLink(
    'https://youtube.com/playlist?list=RDabcdefghijk&playnext=1',
  );
  assert.equal(link?.playlistId, 'RDabcdefghijk');
  assert.equal(link?.videoId, undefined);
  assert.equal(
    youtubeLink('https://www.youtube.com/watch?v=abcdefghijk&list=RDabcdefghijk')
      ?.playlistId,
    'RDabcdefghijk',
    'a watch link inside a mix still carries the list',
  );
  // Every mix flavour YouTube serves resolves back to the seed video it was built from.
  for (const list of [
    'RDabcdefghijk',
    'RDMMabcdefghijk',
    'RDAMVMabcdefghijk',
    'RDEMabcdefghijk',
  ])
    assert.equal(mixSeed(list), 'abcdefghijk', list);
  // Curated RD lists and ordinary playlists are viewable directly and must not be rewritten.
  for (const list of [
    'RDCLAK5uy_kLWIr9gv1XLlPbaDS965-Db4TrBoUTxQ8',
    'PLabcdefghijk',
    'RDtooshort',
    'RD',
  ])
    assert.equal(mixSeed(list), undefined, list);
});

test('metadata prefers structured music tags and treats title-splitting only as a lyrics hint', () => {
  const track = normalizeTrack({
    id: 'abcdefghijk',
    title: 'Singer - A Song (Official Video)',
    channel: 'Channel',
    duration: 201,
  })!;
  assert.equal(track.artist, 'Channel');
  assert.equal(track.lyricsArtist, 'Singer');
  assert.equal(track.lyricsTitle, 'A Song');
  const tagged = normalizeTrack({
    id: 'abcdefghijk',
    title: 'Video title',
    track: 'A Song',
    artist: 'Singer',
    album: 'Album',
    duration: 201,
  })!;
  assert.equal(tagged.title, 'A Song');
  assert.equal(tagged.artist, 'Singer');
  assert.equal(
    normalizeTrack({ id: 'abcdefghijk', title: 'Live', is_live: true }),
    undefined,
  );
  assert.equal(
    normalizeTrack({
      id: 'abcdefghijk',
      title: 'Private',
      availability: 'private',
    }),
    undefined,
  );
});

test('stream URLs cannot turn the proxy into an arbitrary host or local-network proxy', () => {
  assert.equal(
    mediaUrl('https://rr1---sample.googlevideo.com/videoplayback?id=test')
      .hostname,
    'rr1---sample.googlevideo.com',
  );
  for (const url of [
    'http://rr1.googlevideo.com/audio',
    'https://googlevideo.com.evil.example/audio',
    'https://127.0.0.1/audio',
    'https://rr1.googlevideo.com:9000/audio',
    'https://name:password@rr1.googlevideo.com/audio',
  ])
    assert.throws(() => mediaUrl(url));
  assert.match(
    extractorError('Sign in to confirm you are not a bot').message,
    /requires verification/,
  );
  assert.match(
    extractorError('Requested format is not available').message,
    /compatible direct audio/,
  );
});

test('automatic lyrics need matching title, artist, duration and an unambiguous recording', () => {
  const track = normalizeTrack({
    id: 'abcdefghijk',
    title: 'Video',
    track: 'A Song',
    artist: 'Singer',
    album: 'Album',
    duration: 200,
  })!;
  const record = {
    id: 1,
    trackName: 'A Song',
    artistName: 'Singer',
    albumName: 'Album',
    duration: 200.6,
    instrumental: false,
    syncedLyrics: '[00:01]Original test words',
  };
  assert.equal(exactLyrics([record], track)?.id, 1);
  for (const duration of [199.999, 201, 202])
    assert.equal(exactLyrics([{ ...record, duration }], track), undefined);
  assert.equal(exactLyrics([{ ...record, duration: 220 }], track), undefined);
  assert.equal(
    exactLyrics([{ ...record, artistName: 'Other' }], track),
    undefined,
  );
  assert.equal(
    exactLyrics([record], { ...track, lyricsArtist: undefined }),
    undefined,
  );
  assert.equal(exactLyrics([record, { ...record, id: 2 }], track), undefined);
});

test('shuffle visits each entry once and preserves previous/next semantics with repeat', () => {
  const order = queueOrder(5, 2, true, () => 0.4);
  assert.equal(order[0], 2);
  assert.equal(new Set(order).size, 5);
  let current: number | undefined = order[0];
  const visited: (number | undefined)[] = [current];
  for (let i = 0; i < 4; i++) {
    current = nextInQueue(order, current!, 1, false);
    visited.push(current);
  }
  assert.deepEqual(visited, order);
  assert.equal(nextInQueue(order, current!, 1, false), undefined);
  assert.equal(nextInQueue(order, current!, 1, true), order[0]);
  assert.equal(nextInQueue(order, order[2], -1, false), order[1]);
  assert.deepEqual(queueOrder(3, 1, false), [0, 1, 2]);
  assert.equal(nextInQueue([], 0, 1, true), undefined);
});
