import {
  RadioTower,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  Timer,
  Volume2,
} from 'lucide-react';
import type { Player } from '../usePlayer';

const SLEEP_CHOICES = [15, 30, 45, 60, 90];

export function PlaybackOptions({
  player,
  startRadio,
}: {
  player: Player;
  startRadio: () => void;
}) {
  const remaining = player.sleepAt
    ? Math.max(0, Math.round((player.sleepAt - Date.now()) / 60_000))
    : undefined;
  return (
    <>
      <div
        className="playback-options"
        aria-label="Additional playback controls"
      >
      <button
        className="icon-button"
        aria-label="Go to previous track"
        disabled={!player.current}
        onClick={() => player.skip(-1)}
      >
        <SkipBack size={18} />
      </button>
      <button
        className={`icon-button ${player.shuffle ? 'active' : ''}`}
        aria-label="Toggle shuffle"
        aria-pressed={player.shuffle}
        disabled={!player.current}
        onClick={player.changeShuffle}
      >
        <Shuffle size={18} />
      </button>
      <button
        className={`icon-button ${player.repeat !== 'off' ? 'active' : ''}`}
        aria-label={`Change repeat, currently ${player.repeat}`}
        disabled={!player.current}
        onClick={player.changeRepeat}
      >
        {player.repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
      </button>
      <button
        className={`icon-button ${player.radio ? 'active' : ''}`}
        aria-label={player.radio ? 'Stop endless radio' : 'Start endless radio'}
        aria-pressed={player.radio}
        disabled={!player.current}
        onClick={() => (player.radio ? player.changeRadio() : startRadio())}
      >
        <RadioTower size={18} />
      </button>
      <Volume2 size={17} />
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        aria-label="Player panel volume"
        value={player.volume}
        onChange={(event) => player.changeVolume(Number(event.target.value))}
      />
      </div>
      <div className="sleep-row">
        <span className="sleep-label">
          <Timer size={15} />
          {remaining !== undefined
            ? `Pausing in ${remaining} min`
            : 'Sleep timer'}
        </span>
        {SLEEP_CHOICES.map((minutes) => (
          <button
            key={minutes}
            className="chip"
            aria-label={`Sleep in ${minutes} minutes`}
            onClick={() => player.sleep(minutes)}
          >
            {minutes}m
          </button>
        ))}
        <button
          className="chip"
          disabled={!player.sleepAt}
          onClick={() => player.sleep()}
        >
          off
        </button>
      </div>
    </>
  );
}
