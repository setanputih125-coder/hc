import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeLyric,
  lyricOffset,
  lyricSeekTime,
  parseLyrics,
} from '../shared/lyrics.js';
import {
  LyricPreferences,
  maxLyricOffset,
} from '../shared/lyric-preferences.js';

test('aligning line A at audio second 30 corrects highlighting and C → A → B seeks', () => {
  const { lines } = parseLyrics(
    '[00:10]Original A\n[00:20]Original B\n[00:30]Original C',
  );
  const audioPosition = 30;
  assert.equal(activeLyric(lines, audioPosition), 2);
  const offset = lyricOffset(lines[0].time, audioPosition);
  assert.equal(offset, -20);
  assert.equal(activeLyric(lines, audioPosition + offset), 0);
  for (const index of [2, 0, 1, 0, 2]) {
    const seek = lyricSeekTime(lines[index].time, offset);
    assert.equal(seek, lines[index].time + 20);
    assert.equal(activeLyric(lines, seek + offset), index);
  }
});

test('file offset and browser correction each apply once at millisecond boundaries', () => {
  const { lines } = parseLyrics(
    '[offset:500]\n[00:10.123]Original A\n[00:20.345]Original B',
  );
  assert.equal(lines[0].time, 9.623);
  for (const offset of [-20.777, -0.1, 0, 0.1, 0.777]) {
    for (const [index, line] of lines.entries()) {
      const seek = lyricSeekTime(line.time, offset);
      assert.equal(activeLyric(lines, seek + offset), index);
      assert.equal(activeLyric(lines, seek + offset - 0.002), index - 1);
    }
  }
  assert.equal(lyricSeekTime(1, 3), 0);
  assert.equal(activeLyric(lines, Number.NaN), -1);
});

test('simultaneous timestamps stay one selectable cue rather than skipping to the last line', () => {
  const { lines } = parseLyrics(
    '[00:30]Original A\n[00:30]Original B\n[00:30][00:30]Original B\n[00:40]Original C',
  );
  assert.deepEqual(lines, [
    { time: 30, text: 'Original A\nOriginal B' },
    { time: 40, text: 'Original C' },
  ]);
  assert.equal(activeLyric(lines, lyricSeekTime(lines[0].time, 0)), 0);
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test('manual recording and timing survive remount/reload without leaking across video or version', () => {
  const storage = memoryStorage();
  const first = new LyricPreferences(storage);
  first.select('abcdefghijk', 12);
  first.setOffset('abcdefghijk', 12, -20.123);
  first.setOffset('abcdefghijk', 13, 1.5);
  const reopened = new LyricPreferences(storage);
  assert.equal(reopened.selected('abcdefghijk'), 12);
  assert.equal(reopened.offset('abcdefghijk', 12), -20.123);
  assert.equal(reopened.offset('abcdefghijk', 13), 1.5);
  assert.equal(reopened.offset('abcdefghijz', 12), 0);
  reopened.select('abcdefghijk', 13);
  assert.equal(new LyricPreferences(storage).selected('abcdefghijk'), 13);
  reopened.select('abcdefghijk');
  assert.equal(
    new LyricPreferences(storage).selected('abcdefghijk'),
    undefined,
  );
  assert.equal(
    new LyricPreferences(storage).offset('abcdefghijk', 12),
    -20.123,
  );
  reopened.setOffset('abcdefghijk', 12, 0);
  assert.equal(new LyricPreferences(storage).offset('abcdefghijk', 12), 0);
});

test('malformed or denied browser storage cannot break lyrics playback', () => {
  const storage = memoryStorage();
  storage.setItem(
    'undertone.lyric-sync.v1',
    JSON.stringify([
      ['offset:abcdefghijk:12', 'wrong'],
      ['video:abcdefghijk', -1],
      ['offset:abcdefghijk:13', maxLyricOffset + 1],
      ['video:abcdefghijz', 7],
    ]),
  );
  const loaded = new LyricPreferences(storage);
  assert.equal(loaded.selected('abcdefghijk'), undefined);
  assert.equal(loaded.selected('abcdefghijz'), 7);
  assert.equal(loaded.offset('abcdefghijk', 12), 0);
  assert.equal(loaded.offset('abcdefghijk', 13), 0);
  loaded.setOffset('abcdefghijk', 12, Number.NaN);
  assert.equal(loaded.offset('abcdefghijk', 12), 0);
  storage.setItem('undertone.lyric-sync.v1', '{');
  assert.doesNotThrow(() => new LyricPreferences(storage));
  const denied = new LyricPreferences({
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  });
  denied.select('abcdefghijk', 12);
  denied.setOffset('abcdefghijk', 12, -10);
  assert.equal(denied.offset('abcdefghijk', 12), -10);
});

test('sync preferences remain bounded instead of storing lyric content', () => {
  const storage = memoryStorage();
  const preferences = new LyricPreferences(storage);
  for (let id = 1; id <= 350; id++) preferences.setOffset('abcdefghijk', id, 1);
  const entries = JSON.parse(storage.getItem('undertone.lyric-sync.v1')!);
  assert.equal(entries.length, 300);
  assert.ok(
    entries.every(
      ([key, value]: [string, number]) =>
        typeof key === 'string' && typeof value === 'number',
    ),
  );
});
