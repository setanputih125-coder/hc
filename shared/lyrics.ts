import type { Lyrics } from './types.js';

export function parseLyrics(
  input: string,
  origin: Lyrics['origin'] = 'lrclib',
): Lyrics {
  const text = input.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const offset = Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0) / 1000;
  const lines: Lyrics['lines'] = [];
  const plain: string[] = [];
  for (const line of text.split('\n')) {
    const stamps = [...line.matchAll(/\[(\d+):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];
    const value = line
      .replace(/\[[^\]]*\]/g, '')
      .replace(/<\d+:[0-5]\d(?:\.\d{1,3})?>/g, '')
      .trim();
    if (value) plain.push(value);
    for (const stamp of stamps) {
      const time =
        Number(stamp[1]) * 60 +
        Number(stamp[2]) +
        Number(`0.${stamp[3] ?? '0'}`) -
        offset;
      lines.push({ time: Math.max(0, time), text: value });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  const grouped: Lyrics['lines'] = [];
  for (const line of lines) {
    const previous = grouped.at(-1);
    if (previous && previous.time === line.time) {
      if (line.text && !previous.text.split('\n').includes(line.text))
        previous.text = [previous.text, line.text].filter(Boolean).join('\n');
    } else grouped.push({ ...line });
  }
  return { lines: grouped, plain: plain.join('\n'), origin };
}

export function activeLyric(lines: Lyrics['lines'], position: number): number {
  if (!Number.isFinite(position)) return -1;
  const milliseconds = Math.round(position * 1000);
  let low = 0;
  let high = lines.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (Math.round(lines[mid].time * 1000) <= milliseconds) low = mid + 1;
    else high = mid - 1;
  }
  return high;
}

export function lyricSeekTime(time: number, offset: number) {
  return Math.max(0, Math.round((time - offset) * 1000) / 1000);
}

export function lyricOffset(time: number, position: number) {
  return Math.round((time - position) * 1000) / 1000;
}
