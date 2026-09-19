import type { PlayEvent, StatEntry, Stats } from './types.js';

export const MIN_PLAY_SECONDS = 20;
export const HISTORY_LIMIT = 2000;

function rank(
  events: PlayEvent[],
  key: (event: PlayEvent) => string,
  entry: (event: PlayEvent) => Omit<StatEntry, 'plays' | 'seconds' | 'key'>,
  limit: number,
): StatEntry[] {
  const totals = new Map<string, StatEntry>();
  for (const event of events) {
    const id = key(event);
    if (!id) continue;
    const existing = totals.get(id);
    if (existing) {
      existing.plays++;
      existing.seconds += event.seconds;
    } else
      totals.set(id, {
        key: id,
        ...entry(event),
        plays: 1,
        seconds: event.seconds,
      });
  }
  return [...totals.values()]
    .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays)
    .slice(0, limit);
}

export function summarize(events: PlayEvent[], limit = 10): Stats {
  const days = new Set(events.map((event) => event.playedAt.slice(0, 10)));
  return {
    plays: events.length,
    seconds: events.reduce((total, event) => total + event.seconds, 0),
    tracks: new Set(events.map((event) => event.id)).size,
    artists: new Set(events.map((event) => event.artist)).size,
    days: days.size,
    since: events.at(0)?.playedAt,
    topTracks: rank(
      events,
      (event) => event.id,
      (event) => ({
        label: event.title,
        detail: event.artist,
        artwork: event.artwork,
      }),
      limit,
    ),
    topArtists: rank(
      events,
      (event) => event.artist,
      (event) => ({ label: event.artist, artwork: event.artwork }),
      limit,
    ),
    recent: events.slice(-limit).reverse(),
  };
}
