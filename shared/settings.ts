import type { Equalizer, Settings, Theme } from './types.js';

export const EQ_FREQUENCIES = [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;
export const EQ_BAND_LIMIT = 12;
export const EQ_PREAMP_LIMIT = 12;
export const MAX_CROSSFADE = 12;
export const THEMES: Theme[] = ['undertone', 'noir', 'ember', 'tide'];
export const PLAYBACK_RATES = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];

export const EQ_PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6, 5, 4, 2, 0, 0, 0, 0, 1, 2],
  vocal: [-2, -1, 0, 2, 4, 4, 3, 2, 0, -1],
  acoustic: [3, 2, 1, 0, 1, 1, 2, 3, 3, 2],
  electronic: [5, 4, 1, 0, -2, 1, 1, 3, 4, 5],
  night: [-3, -2, 0, 2, 3, 2, 1, -1, -3, -4],
  podcast: [-6, -4, -1, 3, 5, 5, 3, 1, -1, -3],
};

export const defaultEqualizer = (): Equalizer => ({
  enabled: false,
  preset: 'flat',
  preamp: 0,
  bands: [...EQ_PRESETS.flat],
});

export const defaultSettings = (): Settings => ({
  audioFormat: 'best',
  lyricsEnabled: true,
  radioEnabled: true,
  historyEnabled: true,
  crossfadeSeconds: 0,
  normalizeVolume: false,
  playbackRate: 1,
  theme: 'undertone',
  equalizer: defaultEqualizer(),
});

const clamp = (value: number, limit: number) =>
  Math.max(-limit, Math.min(limit, Math.round(value * 10) / 10));

export function normalizeEqualizer(input: unknown): Equalizer {
  const value = (input ?? {}) as Partial<Equalizer>;
  const bands = Array.isArray(value.bands) ? value.bands : [];
  return {
    enabled: value.enabled === true,
    preset:
      typeof value.preset === 'string' && value.preset in EQ_PRESETS
        ? value.preset
        : 'custom',
    preamp: Number.isFinite(value.preamp)
      ? clamp(Number(value.preamp), EQ_PREAMP_LIMIT)
      : 0,
    bands: EQ_FREQUENCIES.map((_, index) =>
      Number.isFinite(bands[index]) ? clamp(Number(bands[index]), EQ_BAND_LIMIT) : 0,
    ),
  };
}

/** Accepts partial or untrusted input from storage and HTTP and always yields usable settings. */
export function normalizeSettings(input: unknown): Settings {
  const value = (input ?? {}) as Partial<Settings>;
  const rate = Number(value.playbackRate);
  const crossfade = Number(value.crossfadeSeconds);
  return {
    audioFormat: value.audioFormat === 'm4a' ? 'm4a' : 'best',
    lyricsEnabled: value.lyricsEnabled !== false,
    radioEnabled: value.radioEnabled !== false,
    historyEnabled: value.historyEnabled !== false,
    crossfadeSeconds: Number.isFinite(crossfade)
      ? Math.max(0, Math.min(MAX_CROSSFADE, Math.round(crossfade)))
      : 0,
    normalizeVolume: value.normalizeVolume === true,
    playbackRate: PLAYBACK_RATES.includes(rate) ? rate : 1,
    theme: THEMES.includes(value.theme as Theme)
      ? (value.theme as Theme)
      : 'undertone',
    equalizer: normalizeEqualizer(value.equalizer),
  };
}

export function equalizerMatchesPreset(bands: number[], preset: string) {
  const target = EQ_PRESETS[preset];
  return !!target && target.every((value, index) => value === bands[index]);
}

export function presetFor(bands: number[]) {
  return (
    Object.keys(EQ_PRESETS).find((preset) =>
      equalizerMatchesPreset(bands, preset),
    ) ?? 'custom'
  );
}
