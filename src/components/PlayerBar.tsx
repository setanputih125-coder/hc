import {
  AlignLeft,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  LoaderCircle,
} from 'lucide-react';
import type { Player } from '../usePlayer';
import { Artwork } from './Artwork';

export function timeLabel(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

export function PlayerBar({
  player,
  panel,
  setPanel,
}: {
  player: Player;
  panel: string;
  setPanel: (panel: string) => void;
}) {
  const { current, playing, position, duration } = player;
  return (
    <footer className="player-bar" aria-label="Music player">
      <div className="now-playing">
        <Artwork
          src={current?.artwork}
          title={current?.album || 'Your next favorite'}
        />
        <div>
          <strong>{current?.title || 'Make yourself at home'}</strong>
          <span>{current?.artist || 'Choose something to listen to'}</span>
        </div>
      </div>
      <div className="transport">
        <div className="transport-buttons">
          <button
            className={`icon-button secondary-control ${player.shuffle ? 'active' : ''}`}
            aria-label="Shuffle"
            aria-pressed={player.shuffle}
            disabled={!current}
            onClick={player.changeShuffle}
          >
            <Shuffle size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Previous track"
            disabled={!current}
            onClick={() => player.skip(-1)}
          >
            <SkipBack size={19} fill="currentColor" />
          </button>
          <button
            className="play-button"
            aria-label={
              player.loading ? 'Loading audio' : playing ? 'Pause' : 'Play'
            }
            disabled={!current || player.loading}
            onClick={player.toggle}
          >
            {player.loading ? (
              <LoaderCircle size={21} className="spin" />
            ) : playing ? (
              <Pause size={21} fill="currentColor" />
            ) : (
              <Play size={21} fill="currentColor" />
            )}
          </button>
          <button
            className="icon-button"
            aria-label="Next track"
            disabled={!current}
            onClick={() => player.skip(1)}
          >
            <SkipForward size={19} fill="currentColor" />
          </button>
          <button
            className={`icon-button secondary-control ${player.repeat !== 'off' ? 'active' : ''}`}
            aria-label={`Repeat: ${player.repeat}`}
            disabled={!current}
            onClick={player.changeRepeat}
          >
            {player.repeat === 'one' ? (
              <Repeat1 size={17} />
            ) : (
              <Repeat size={17} />
            )}
          </button>
        </div>
        <div className="seek-row">
          <span>{timeLabel(position)}</span>
          <input
            aria-label="Seek"
            type="range"
            min="0"
            max={duration || 1}
            step="0.1"
            value={Math.min(position, duration || 1)}
            disabled={!current || player.loading || !duration}
            onChange={(event) => player.seek(Number(event.target.value))}
            style={
              {
                '--progress': `${duration ? (position / duration) * 100 : 0}%`,
              } as React.CSSProperties
            }
          />
          <span>{timeLabel(duration)}</span>
        </div>
      </div>
      <div className="player-tools">
        <button
          className={`icon-button ${panel === 'lyrics' ? 'active' : ''}`}
          aria-label="Show lyrics"
          aria-pressed={panel === 'lyrics'}
          onClick={() => setPanel(panel === 'lyrics' ? '' : 'lyrics')}
        >
          <AlignLeft size={19} />
        </button>
        <button
          className={`icon-button ${panel === 'queue' ? 'active' : ''}`}
          aria-label="Show queue"
          aria-pressed={panel === 'queue'}
          onClick={() => setPanel(panel === 'queue' ? '' : 'queue')}
        >
          <ListMusic size={20} />
        </button>
        <span className="tool-divider" />
        <button
          className="icon-button volume-button"
          aria-label={player.volume === 0 ? 'Unmute' : 'Mute'}
          onClick={() => player.changeVolume(player.volume === 0 ? 0.7 : 0)}
        >
          {player.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          className="volume-range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          aria-label="Volume"
          value={player.volume}
          onChange={(event) => player.changeVolume(Number(event.target.value))}
        />
      </div>
    </footer>
  );
}
