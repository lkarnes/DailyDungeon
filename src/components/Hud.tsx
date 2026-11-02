/** Top HUD: live move/clue counters plus the optional tools (flag + scan). */
import type { GameState } from '../hooks/useGameState';

interface HudProps {
  state: GameState;
  flagMode: boolean;
  scanMode: boolean;
  onToggleFlagMode: () => void;
  onToggleScanMode: () => void;
}

export function Hud({ state, flagMode, scanMode, onToggleFlagMode, onToggleScanMode }: HudProps) {
  const { map } = state;
  return (
    <div className="hud">
      <div className="hud__stats">
        <div className="hud__stat">
          <span className="hud__stat-label">Moves</span>
          <span className="hud__stat-value">{state.movesUsed}</span>
        </div>
        <div className="hud__stat">
          <span className="hud__stat-label">Traps</span>
          <span className="hud__stat-value">{map.trapCount}</span>
        </div>
        <div className="hud__stat">
          <span className="hud__stat-label">Clues</span>
          <span className="hud__stat-value">
            {state.discoveredClueIds.size}/{map.clues.length}
          </span>
        </div>
        {map.collectibles.length > 0 && (
          <div className="hud__stat">
            <span className="hud__stat-label">Treasure</span>
            <span className="hud__stat-value">
              {state.collectedCollectibles.size}/{map.collectibles.length}
            </span>
          </div>
        )}
        {map.key && (
          <div className="hud__stat">
            <span className="hud__stat-label">Key</span>
            <span className="hud__stat-value">{state.hasKey ? '🔑' : '❌'}</span>
          </div>
        )}
      </div>
      <div className="hud__tools">
        <button
          type="button"
          className={`hud__tool-btn ${flagMode ? 'hud__tool-btn--active' : ''}`}
          onClick={onToggleFlagMode}
          title="Toggle flag mode: tap a tile to mark it as a suspected trap (free, no move cost)"
        >
          🚩 Mark Trap
        </button>
        <button
          type="button"
          className={`hud__tool-btn ${scanMode ? 'hud__tool-btn--active' : ''}`}
          onClick={onToggleScanMode}
          disabled={state.scansRemaining <= 0 && !scanMode}
          title="Use a scan to reveal whether an unvisited tile is safe or a trap. Costs points and disables the no-hints bonus."
        >
          🔦 Scan ({state.scansRemaining} left)
        </button>
      </div>
    </div>
  );
}
