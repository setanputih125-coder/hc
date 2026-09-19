import { useEffect, useRef, useState } from 'react';
import type { PlayerState, Settings, Track } from '../shared/types';
import { nextInQueue, queueOrder } from '../shared/queue';
import { MIN_PLAY_SECONDS } from '../shared/stats';
import { api } from './api';
import { AudioEngine } from './audioEngine';

export interface PlayerOptions {
  onError: (message: string) => void;
  onNotice?: (message: string) => void;
  settings: Settings;
}

const FADE_STEPS = 24;

export function usePlayer({ onError, onNotice, settings }: PlayerOptions) {
  const [engine] = useState(() => new AudioEngine());
  const [players] = useState(() => [new Audio(), new Audio()]);
  const slot = useRef(0);
  const audio = () => players[slot.current];
  const generation = useRef(0);
  const order = useRef<number[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const queueRef = useRef<Track[]>([]);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const volumeRef = useRef(0.7);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('off');
  const [radio, setRadio] = useState(false);
  const [sleepAt, setSleepAt] = useState<number>();
  const [restored, setRestored] = useState(false);
  const current = queue[index];
  const config = useRef(settings);
  config.current = settings;
  const latest = useRef({ shuffle, repeat, radio });
  latest.current = { shuffle, repeat, radio };
  const pending = useRef<AbortController | undefined>(undefined);
  const listened = useRef({ id: '', seconds: 0, reported: false });
  const fading = useRef(false);
  const extending = useRef('');

  function updateQueue(tracks: Track[], at: number, rebuild = true) {
    if (rebuild && tracks !== queueRef.current)
      order.current = queueOrder(tracks.length, at, latest.current.shuffle);
    queueRef.current = tracks;
    indexRef.current = at;
    setQueue(tracks);
    setIndex(at);
  }
  async function guard(action: () => unknown | Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Playback failed.');
    }
  }
  async function reportListen() {
    const entry = listened.current;
    if (
      entry.reported ||
      !entry.id ||
      entry.seconds < MIN_PLAY_SECONDS ||
      !config.current.historyEnabled
    )
      return;
    entry.reported = true;
    try {
      await api('/api/history', 'POST', {
        trackId: entry.id,
        seconds: Math.round(entry.seconds),
      });
    } catch {
      // History is a convenience; a failed write must never interrupt playback.
    }
  }
  function fade(element: HTMLAudioElement, to: number, seconds: number) {
    const from = element.volume;
    if (seconds <= 0) {
      element.volume = to;
      return;
    }
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const ratio = Math.min(1, step / FADE_STEPS);
      element.volume = Math.max(0, Math.min(1, from + (to - from) * ratio));
      if (ratio === 1) clearInterval(timer);
    }, (seconds * 1000) / FADE_STEPS);
  }
  async function playAt(tracks: Track[], at: number, start = 0) {
    const track = tracks[at];
    if (!track) return;
    if (tracks.length > 1000)
      throw new Error('A queue can hold up to 1,000 songs.');
    const ticket = ++generation.current;
    pending.current?.abort();
    pending.current = new AbortController();
    void reportListen();
    listened.current = { id: track.id, seconds: 0, reported: false };
    const crossfade = config.current.crossfadeSeconds;
    const previous = audio();
    const seamless = crossfade > 0 && !previous.paused && !!previous.src;
    if (seamless) {
      fade(previous, 0, crossfade);
      const outgoing = previous;
      fading.current = true;
      setTimeout(() => {
        outgoing.pause();
        outgoing.removeAttribute('src');
        outgoing.load();
        fading.current = false;
      }, crossfade * 1000);
      slot.current = slot.current === 0 ? 1 : 0;
    } else {
      previous.pause();
      previous.removeAttribute('src');
      previous.load();
    }
    const element = audio();
    updateQueue(tracks, at);
    setPosition(start);
    setDuration(track.duration);
    setLoading(true);
    try {
      const resolved = await api<Track>(
        `/api/tracks/${track.id}/resolve`,
        'GET',
        undefined,
        pending.current.signal,
      );
      if (ticket !== generation.current) return;
      updateQueue(
        queueRef.current.map((item) =>
          item.id === track.id ? resolved : item,
        ),
        indexRef.current,
        false,
      );
      engine.attach(element);
      engine.resume();
      element.playbackRate = config.current.playbackRate;
      element.volume = seamless ? 0 : volumeRef.current;
      element.src = `/api/tracks/${track.id}/stream`;
      element.currentTime = start;
      await element.play();
      if (seamless) fade(element, volumeRef.current, crossfade);
    } catch (error) {
      if (ticket === generation.current) throw error;
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }
  /** Radio keeps the queue alive by appending a YouTube mix before the last track ends. */
  async function extendRadio() {
    const tracks = queueRef.current;
    const seed = tracks.at(-1);
    if (
      !seed ||
      !latest.current.radio ||
      !config.current.radioEnabled ||
      latest.current.repeat === 'one' ||
      indexRef.current < tracks.length - 2 ||
      tracks.length >= 1000 ||
      extending.current === seed.id
    )
      return;
    extending.current = seed.id;
    try {
      const mix = await api<{ tracks: Track[] }>(
        `/api/tracks/${seed.id}/radio`,
      );
      const known = new Set(queueRef.current.map((track) => track.id));
      const additions = mix.tracks
        .filter((track) => !known.has(track.id))
        .slice(0, 12);
      if (!additions.length) return;
      const next = [...queueRef.current, ...additions];
      order.current = [
        ...order.current,
        ...additions.map((_, offset) => queueRef.current.length + offset),
      ];
      updateQueue(next, indexRef.current, false);
      onNotice?.(`Radio added ${additions.length} songs to your queue.`);
    } catch (error) {
      onError(
        error instanceof Error ? error.message : 'Radio could not continue.',
      );
      setRadio(false);
    }
  }
  function ended() {
    void reportListen();
    const at = indexRef.current;
    const next =
      latest.current.repeat === 'one'
        ? at
        : nextInQueue(order.current, at, 1, latest.current.repeat === 'all');
    if (next !== undefined) void guard(() => playAt(queueRef.current, next));
    else {
      setPlaying(false);
      if (latest.current.radio) void extendRadio();
    }
  }
  const handlers = useRef({ ended, toggle, skip, seek, extendRadio });
  handlers.current = { ended, toggle, skip, seek, extendRadio };
  useEffect(() => {
    const cleanups = players.map((element) => {
      element.preload = 'metadata';
      element.volume = 0.7;
      const active = () => element === audio();
      const tick = () => {
        if (!active() || element.seeking) return;
        setPosition(element.currentTime);
        if (Number.isFinite(element.duration)) setDuration(element.duration);
      };
      const progress = () => {
        if (!active() || element.paused) return;
        listened.current.seconds += 0.25;
        const remaining = element.duration - element.currentTime;
        const crossfade = config.current.crossfadeSeconds;
        if (
          crossfade > 0 &&
          Number.isFinite(remaining) &&
          remaining <= crossfade &&
          !fading.current &&
          latest.current.repeat !== 'one'
        ) {
          const next = nextInQueue(
            order.current,
            indexRef.current,
            1,
            latest.current.repeat === 'all',
          );
          if (next !== undefined) {
            fading.current = true;
            void guard(() => playAt(queueRef.current, next));
          }
        }
        if (
          Number.isFinite(remaining) &&
          remaining <= 30 &&
          indexRef.current >= queueRef.current.length - 2
        )
          void handlers.current.extendRadio();
      };
      const play = () => {
        if (!active()) return;
        setPlaying(true);
        engine.resume();
        if ('mediaSession' in navigator)
          navigator.mediaSession.playbackState = 'playing';
      };
      const pause = () => {
        if (!active() || fading.current) return;
        setPlaying(false);
        if ('mediaSession' in navigator)
          navigator.mediaSession.playbackState = 'paused';
      };
      const error = () => {
        if (!active() || !element.getAttribute('src')) return;
        setLoading(false);
        setPlaying(false);
        onError(
          'The audio stream could not play. Retry with Play, check your connection, or select M4A in Settings if this browser does not support WebM/Opus.',
        );
      };
      const end = () => {
        if (active() && !fading.current) handlers.current.ended();
      };
      const events: [string, EventListener][] = [
        ['timeupdate', tick],
        ['seeked', tick],
        ['loadedmetadata', tick],
        ['durationchange', tick],
        ['play', play],
        ['pause', pause],
        ['ended', end],
        ['error', error],
      ];
      for (const [name, listener] of events)
        element.addEventListener(name, listener);
      const counter = setInterval(progress, 250);
      return () => {
        clearInterval(counter);
        for (const [name, listener] of events)
          element.removeEventListener(name, listener);
        element.pause();
        element.removeAttribute('src');
        element.load();
      };
    });
    if ('mediaSession' in navigator) {
      const actions: Partial<
        Record<MediaSessionAction, MediaSessionActionHandler>
      > = {
        play: () => {
          if (audio().paused) void handlers.current.toggle();
        },
        pause: () => audio().pause(),
        previoustrack: () => handlers.current.skip(-1),
        nexttrack: () => handlers.current.skip(1),
        seekto: (details) => {
          if (details.seekTime !== undefined)
            handlers.current.seek(details.seekTime);
        },
        seekbackward: (details) =>
          handlers.current.seek(audio().currentTime - (details.seekOffset ?? 10)),
        seekforward: (details) =>
          handlers.current.seek(audio().currentTime + (details.seekOffset ?? 10)),
      };
      for (const [name, action] of Object.entries(actions)) {
        try {
          navigator.mediaSession.setActionHandler(
            name as MediaSessionAction,
            action!,
          );
        } catch {}
      }
    }
    return () => {
      generation.current++;
      pending.current?.abort();
      for (const cleanup of cleanups) cleanup();
    };
  }, []);
  useEffect(() => {
    engine.update(settings.equalizer, settings.normalizeVolume);
    if (settings.equalizer.enabled || settings.normalizeVolume)
      for (const element of players) if (element.src) engine.attach(element);
  }, [settings.equalizer, settings.normalizeVolume]);
  useEffect(() => {
    for (const element of players) element.playbackRate = settings.playbackRate;
  }, [settings.playbackRate]);
  useEffect(() => {
    if (!sleepAt) return;
    const remaining = sleepAt - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => {
      audio().pause();
      setSleepAt(undefined);
      onNotice?.('Sleep timer reached. Playback paused.');
    }, remaining);
    return () => clearTimeout(timer);
  }, [sleepAt]);
  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined')
      return;
    navigator.mediaSession.metadata = current
      ? new MediaMetadata({
          title: current.title,
          artist: current.artist,
          album: current.album,
          artwork: current.artwork ? [{ src: current.artwork }] : [],
        })
      : null;
  }, [current?.id, current?.title, current?.artist]);
  useEffect(() => {
    if (
      !('mediaSession' in navigator) ||
      !Number.isFinite(duration) ||
      !duration
    )
      return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.max(0, Math.min(position, duration)),
        playbackRate: settings.playbackRate,
      });
    } catch {}
  }, [duration, position, settings.playbackRate]);
  function reset() {
    generation.current++;
    pending.current?.abort();
    void reportListen();
    for (const element of players) {
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
    setLoading(false);
    setPlaying(false);
    setPosition(0);
    setDuration(0);
    updateQueue([], 0);
  }
  function seek(seconds: number) {
    return guard(() => {
      const element = audio();
      if (loading || !current || !duration || !Number.isFinite(seconds)) return;
      const value = Math.max(0, Math.min(seconds, duration));
      element.currentTime = value;
      if (!element.seeking) setPosition(element.currentTime);
    });
  }
  function toggle() {
    return guard(async () => {
      const element = audio();
      if (!current || loading) return;
      engine.resume();
      if (element.error || !element.getAttribute('src'))
        await playAt(queue, index, position);
      else if (element.paused) await element.play();
      else element.pause();
    });
  }
  function skip(direction: number) {
    return guard(async () => {
      if (!current) return;
      if (direction < 0 && position > 3) {
        await seek(0);
        return;
      }
      const at = nextInQueue(order.current, index, direction, repeat === 'all');
      if (at !== undefined) await playAt(queue, at);
      else if (direction > 0 && latest.current.radio) await extendRadio();
    });
  }
  function changeVolume(value: number) {
    volumeRef.current = value;
    for (const element of players) element.volume = value;
    setVolume(value);
  }
  function changeShuffle() {
    order.current = queueOrder(queue.length, index, !shuffle);
    setShuffle(!shuffle);
  }
  function changeRepeat() {
    setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off');
  }
  function changeRadio() {
    const next = !radio;
    setRadio(next);
    latest.current = { ...latest.current, radio: next };
    if (next) void extendRadio();
  }
  function sleep(minutes?: number) {
    setSleepAt(minutes ? Date.now() + minutes * 60_000 : undefined);
  }
  function add(track: Track) {
    if (!current) return guard(() => playAt([track], 0));
    if (queue.length >= 1000) {
      onError('A queue can hold up to 1,000 songs.');
      return;
    }
    order.current = [...order.current, queue.length];
    updateQueue([...queue, track], index, false);
  }
  function playNext(track: Track) {
    if (!current) return guard(() => playAt([track], 0));
    if (queue.length >= 1000) {
      onError('A queue can hold up to 1,000 songs.');
      return;
    }
    const next = [...queue];
    next.splice(index + 1, 0, track);
    order.current = queueOrder(next.length, index, false);
    updateQueue(next, index, false);
  }
  function remove(at: number) {
    if (at !== index)
      updateQueue(
        queue.filter((_, i) => i !== at),
        at < index ? index - 1 : index,
      );
  }
  function move(at: number, direction: number) {
    const to = at + direction;
    if (to < 0 || to >= queue.length) return;
    const next = [...queue];
    [next[at], next[to]] = [next[to], next[at]];
    updateQueue(next, index === at ? to : index === to ? at : index);
  }
  function restore(state: PlayerState) {
    if (!state.queue.length || restored) return;
    setRestored(true);
    volumeRef.current = state.volume;
    for (const element of players) element.volume = state.volume;
    setVolume(state.volume);
    setShuffle(state.shuffle);
    setRepeat(state.repeat);
    order.current = queueOrder(state.queue.length, state.index, state.shuffle);
    updateQueue(state.queue, state.index, false);
    setPosition(state.position);
    setDuration(state.queue[state.index]?.duration ?? 0);
  }
  function snapshot(): PlayerState {
    return {
      queue: queueRef.current,
      index: indexRef.current,
      position: audio().currentTime || 0,
      volume: volumeRef.current,
      shuffle,
      repeat,
    };
  }
  return {
    current,
    queue,
    index,
    playing,
    loading,
    position,
    getPosition: () => {
      const element = audio();
      return element.seeking ? Number.NaN : element.currentTime;
    },
    duration,
    volume,
    shuffle,
    repeat,
    radio,
    sleepAt,
    engineReady: engine.supported,
    reset,
    toggle,
    seek,
    skip,
    changeVolume,
    changeShuffle,
    changeRepeat,
    changeRadio,
    sleep,
    add,
    playNext,
    remove,
    move,
    restore,
    snapshot,
    play: (tracks: Track[], at = 0) => guard(() => playAt(tracks, at)),
  };
}
export type Player = ReturnType<typeof usePlayer>;
