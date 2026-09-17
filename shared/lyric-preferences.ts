type Storage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
const key = 'undertone.lyric-sync.v1';
export const maxLyricOffset = 120;

export class LyricPreferences {
  private values = new Map<string, number>();

  constructor(private storage?: Storage) {
    try {
      const entries: unknown = JSON.parse(storage?.getItem(key) ?? '[]');
      if (Array.isArray(entries)) {
        for (const entry of entries.slice(-300)) {
          if (!Array.isArray(entry) || entry.length !== 2) continue;
          const [name, value] = entry;
          if (typeof name !== 'string' || typeof value !== 'number') continue;
          if (
            (/^video:[\w-]{11}$/.test(name) &&
              Number.isSafeInteger(value) &&
              value > 0) ||
            (/^offset:[\w-]{11}:\d+$/.test(name) &&
              Number.isFinite(value) &&
              Math.abs(value) <= maxLyricOffset)
          )
            this.values.set(name, value);
        }
      }
    } catch {}
  }

  private save(name: string, value?: number) {
    this.values.delete(name);
    if (value !== undefined) this.values.set(name, value);
    while (this.values.size > 300)
      this.values.delete(this.values.keys().next().value!);
    try {
      this.storage?.setItem(key, JSON.stringify([...this.values]));
    } catch {}
  }

  selected(videoId: string) {
    return this.values.get(`video:${videoId}`);
  }

  select(videoId: string, recordId?: number) {
    if (!/^[\w-]{11}$/.test(videoId)) return;
    if (
      recordId !== undefined &&
      (!Number.isSafeInteger(recordId) || recordId <= 0)
    )
      return;
    this.save(`video:${videoId}`, recordId);
  }

  offset(videoId: string, recordId: number) {
    return this.values.get(`offset:${videoId}:${recordId}`) ?? 0;
  }

  setOffset(videoId: string, recordId: number, offset: number) {
    if (
      !/^[\w-]{11}$/.test(videoId) ||
      !Number.isSafeInteger(recordId) ||
      recordId <= 0
    )
      return;
    if (!Number.isFinite(offset) || Math.abs(offset) > maxLyricOffset) return;
    this.save(`offset:${videoId}:${recordId}`, offset);
  }
}
