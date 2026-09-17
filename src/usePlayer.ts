import { useEffect, useRef, useState } from 'react';
import type { Track } from '../shared/types';
import { nextInQueue, queueOrder } from '../shared/queue';
import { api } from './api';

export function usePlayer(onError: (message: string) => void) {
  const [audio] = useState(() => new Audio());
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
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('off');
  const current = queue[index];
  const latest = useRef({ shuffle, repeat });
  latest.current = { shuffle, repeat };
  const pending = useRef<AbortController | undefined>(undefined);

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
  async function playAt(tracks: Track[], at: number, start = 0) {
    const track = tracks[at];
    if (!track) return;
    if (tracks.length > 1000)
      throw new Error('A queue can hold up to 1,000 songs.');
    const ticket = ++generation.current;
    pending.current?.abort();
    pending.current = new AbortController();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
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
      audio.src = `/api/tracks/${track.id}/stream`;
      audio.currentTime = start;
      await audio.play();
    } catch (error) {
      if (ticket === generation.current) throw error;
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }
  function ended() {
    const at = indexRef.current;
    const next =
      latest.current.repeat === 'one'
        ? at
        : nextInQueue(order.current, at, 1, latest.current.repeat === 'all');
    if (next !== undefined) void guard(() => playAt(queueRef.current, next));
    else setPlaying(false);
  }
  const handlers = useRef({ ended, toggle, skip, seek });
  handlers.current = { ended, toggle, skip, seek };
  useEffect(() => {
    audio.preload = 'metadata';
    audio.volume = 0.7;
    const tick = () => {
      if (audio.seeking) return;
      setPosition(audio.currentTime);
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const play = () => {
      setPlaying(true);
      if ('mediaSession' in navigator)
        navigator.mediaSession.playbackState = 'playing';
    };
    const pause = () => {
      setPlaying(false);
      if ('mediaSession' in navigator)
        navigator.mediaSession.playbackState = 'paused';
    };
    const error = () => {
      if (!audio.getAttribute('src')) return;
      setLoading(false);
      setPlaying(false);
      onError(
        'The audio stream could not play. Retry with Play, check your connection, or select M4A in Settings if this browser does not support WebM/Opus.',
      );
    };
    const end = () => handlers.current.ended();
    audio.addEventListener('timeupdate', tick);
    audio.addEventListener('seeked', tick);
    audio.addEventListener('loadedmetadata', tick);
    audio.addEventListener('durationchange', tick);
    audio.addEventListener('play', play);
    audio.addEventListener('pause', pause);
    audio.addEventListener('ended', end);
    audio.addEventListener('error', error);
    if ('mediaSession' in navigator) {
      const actions: Partial<
        Record<MediaSessionAction, MediaSessionActionHandler>
      > = {
        play: () => {
          if (audio.paused) void handlers.current.toggle();
        },
        pause: () => audio.pause(),
        previoustrack: () => handlers.current.skip(-1),
        nexttrack: () => handlers.current.skip(1),
        seekto: (details) => {
          if (details.seekTime !== undefined)
            handlers.current.seek(details.seekTime);
        },
        seekbackward: (details) =>
          handlers.current.seek(audio.currentTime - (details.seekOffset ?? 10)),
        seekforward: (details) =>
          handlers.current.seek(audio.currentTime + (details.seekOffset ?? 10)),
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
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.removeEventListener('timeupdate', tick);
      audio.removeEventListener('seeked', tick);
      audio.removeEventListener('loadedmetadata', tick);
      audio.removeEventListener('durationchange', tick);
      audio.removeEventListener('play', play);
      audio.removeEventListener('pause', pause);
      audio.removeEventListener('ended', end);
      audio.removeEventListener('error', error);
    };
  }, []);
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
        playbackRate: 1,
      });
    } catch {}
  }, [duration, position]);
  function reset() {
    generation.current++;
    pending.current?.abort();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    setLoading(false);
    setPlaying(false);
    setPosition(0);
    setDuration(0);
    updateQueue([], 0);
  }
  function seek(seconds: number) {
    return guard(() => {
      if (loading || !current || !duration || !Number.isFinite(seconds)) return;
      const value = Math.max(0, Math.min(seconds, duration));
      audio.currentTime = value;
      if (!audio.seeking) setPosition(audio.currentTime);
    });
  }
  function toggle() {
    return guard(async () => {
      if (!current || loading) return;
      if (audio.error || !audio.getAttribute('src'))
        await playAt(queue, index, position);
      else if (audio.paused) await audio.play();
      else audio.pause();
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
    });
  }
  function changeVolume(value: number) {
    audio.volume = value;
    setVolume(value);
  }
  function changeShuffle() {
    order.current = queueOrder(queue.length, index, !shuffle);
    setShuffle(!shuffle);
  }
  function changeRepeat() {
    setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off');
  }
  function add(track: Track) {
    if (!current) return guard(() => playAt([track], 0));
    if (queue.length >= 1000) {
      onError('A queue can hold up to 1,000 songs.');
      return;
    }
    updateQueue([...queue, track], index);
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
  return {
    current,
    queue,
    index,
    playing,
    loading,
    position,
    getPosition: () => (audio.seeking ? Number.NaN : audio.currentTime),
    duration,
    volume,
    shuffle,
    repeat,
    reset,
    toggle,
    seek,
    skip,
    changeVolume,
    changeShuffle,
    changeRepeat,
    add,
    remove,
    move,
    play: (tracks: Track[], at = 0) => guard(() => playAt(tracks, at)),
  };
}
export type Player = ReturnType<typeof usePlayer>;
