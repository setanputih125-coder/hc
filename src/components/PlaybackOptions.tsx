import { Repeat, Repeat1, Shuffle, SkipBack, Volume2 } from 'lucide-react';
import type { Player } from '../usePlayer';

export function PlaybackOptions({ player }: { player: Player }) {
  return (
    <div className="playback-options" aria-label="Additional playback controls">
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
  );
}
