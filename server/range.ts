export type ByteRange = { start: number; end: number } | 'invalid' | undefined;

export function parseRange(
  header: string | undefined,
  size: number,
): ByteRange {
  if (!header) return undefined;
  if (!header.startsWith('bytes=')) return undefined;
  if (header.includes(',')) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return 'invalid';
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if (
    (first !== undefined && !Number.isSafeInteger(first)) ||
    (last !== undefined && !Number.isSafeInteger(last))
  )
    return 'invalid';
  if (first === undefined) {
    if (!last) return 'invalid';
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  if (first >= size || (last !== undefined && last < first)) return 'invalid';
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}
