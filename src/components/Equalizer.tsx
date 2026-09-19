import { AudioLines, RotateCcw } from 'lucide-react';
import {
  EQ_BAND_LIMIT,
  EQ_FREQUENCIES,
  EQ_PREAMP_LIMIT,
  EQ_PRESETS,
  presetFor,
} from '../../shared/settings';
import type { Equalizer as EqualizerSettings } from '../../shared/types';

const label = (frequency: number) =>
  frequency >= 1000 ? `${frequency / 1000}k` : String(frequency);

export function EqualizerPanel({
  value,
  supported,
  onChange,
}: {
  value: EqualizerSettings;
  supported: boolean;
  onChange: (equalizer: EqualizerSettings) => void;
}) {
  const setBand = (index: number, gain: number) => {
    const bands = value.bands.map((band, at) => (at === index ? gain : band));
    onChange({ ...value, bands, preset: presetFor(bands) });
  };
  return (
    <div className="eq-panel">
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={!supported}
          onChange={(event) =>
            onChange({ ...value, enabled: event.target.checked })
          }
        />
        Enable the 10-band equalizer
      </label>
      {!supported && (
        <p className="field-help">
          This browser does not expose Web Audio, so the equalizer and volume
          normalization stay unavailable. Playback is unaffected.
        </p>
      )}
      <div className="eq-presets">
        {Object.keys(EQ_PRESETS).map((preset) => (
          <button
            type="button"
            key={preset}
            className={`chip ${value.preset === preset ? 'active' : ''}`}
            disabled={!supported}
            onClick={() =>
              onChange({
                ...value,
                preset,
                bands: [...EQ_PRESETS[preset]],
                enabled: true,
              })
            }
          >
            {preset}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          disabled={!supported}
          onClick={() =>
            onChange({
              ...value,
              preset: 'flat',
              preamp: 0,
              bands: [...EQ_PRESETS.flat],
            })
          }
        >
          <RotateCcw size={13} />
          reset
        </button>
      </div>
      <div className="eq-bands" aria-hidden={!supported}>
        {EQ_FREQUENCIES.map((frequency, index) => (
          <div className="eq-band" key={frequency}>
            <span className="eq-gain">
              {value.bands[index] > 0 ? '+' : ''}
              {value.bands[index]}
            </span>
            <input
              type="range"
              className="eq-slider"
              min={-EQ_BAND_LIMIT}
              max={EQ_BAND_LIMIT}
              step={1}
              disabled={!supported}
              value={value.bands[index]}
              aria-label={`${label(frequency)} hertz gain`}
              onChange={(event) => setBand(index, Number(event.target.value))}
            />
            <span className="eq-frequency">{label(frequency)}</span>
          </div>
        ))}
      </div>
      <label className="eq-preamp">
        <span>
          <AudioLines size={15} /> Preamp
        </span>
        <input
          type="range"
          min={-EQ_PREAMP_LIMIT}
          max={EQ_PREAMP_LIMIT}
          step={0.5}
          disabled={!supported}
          value={value.preamp}
          aria-label="Equalizer preamp"
          onChange={(event) =>
            onChange({ ...value, preamp: Number(event.target.value) })
          }
        />
        <span className="eq-gain">
          {value.preamp > 0 ? '+' : ''}
          {value.preamp} dB
        </span>
      </label>
    </div>
  );
}
