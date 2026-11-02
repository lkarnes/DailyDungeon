/** On-screen directional controls (mirrors arrow key / WASD input). */
import type { Direction } from '../hooks/useGameState';

interface ControlsProps {
  onMove: (dir: Direction) => void;
  disabled: boolean;
}

export function Controls({ onMove, disabled }: ControlsProps) {
  return (
    <div className="controls" aria-label="Movement controls">
      <div className="controls__row">
        <button type="button" className="controls__btn" onClick={() => onMove('up')} disabled={disabled} aria-label="Move up">
          ▲
        </button>
      </div>
      <div className="controls__row">
        <button type="button" className="controls__btn" onClick={() => onMove('left')} disabled={disabled} aria-label="Move left">
          ◀
        </button>
        <button type="button" className="controls__btn" onClick={() => onMove('down')} disabled={disabled} aria-label="Move down">
          ▼
        </button>
        <button type="button" className="controls__btn" onClick={() => onMove('right')} disabled={disabled} aria-label="Move right">
          ▶
        </button>
      </div>
    </div>
  );
}
