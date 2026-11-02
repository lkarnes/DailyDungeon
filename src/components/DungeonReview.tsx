/**
 * A non-interactive, fully-revealed view of today's dungeon shown when a
 * player reloads the page after already completing the daily run. Since we
 * only persist the run *summary* (not a full move history), this renders the
 * solved map directly from the DungeonMap - every clue, trap, and lever
 * visible - rather than a confusing fresh "unplayed" board.
 */
import { useMemo } from 'react';
import type { DungeonMap } from '../game/types';
import { posKey } from '../game/types';
import type { StoredResult } from '../game/storage';
import type { GameState } from '../hooks/useGameState';
import { Board } from './Board';
import { ClueLog } from './ClueLog';

function buildFullyRevealedState(map: DungeonMap, result: StoredResult): GameState {
  const visited = new Set<string>();
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      if (map.terrain[r][c] === 'floor') visited.add(posKey({ row: r, col: c }));
    }
  }
  const log: GameState['log'] = map.clues.map((clue) => ({ kind: 'clue', clue }));

  return {
    map,
    playerPos: result.trapTriggered ? map.start : map.exit,
    path: [],
    visited,
    discoveredClueIds: new Set(map.clues.map((c) => c.id)),
    hasKey: true,
    activatedGates: new Set(map.gates.map((_, i) => i)),
    collectedCollectibles: new Set(map.collectibles.map(posKey)),
    flagged: new Set(),
    movesUsed: result.movesUsed,
    hintsUsed: result.hintsUsed,
    scansRemaining: 0,
    scannedSafe: new Set(),
    scannedTrap: new Set(),
    status: result.trapTriggered ? 'lost' : 'won',
    log,
    revealedTraps: new Set(map.traps.map(posKey)),
  };
}

export function DungeonReview({ map, result }: { map: DungeonMap; result: StoredResult }) {
  const state = useMemo(() => buildFullyRevealedState(map, result), [map, result]);

  return (
    <div className="game-session">
      <div className="practice-banner">
        🔎 Today&rsquo;s dungeon, fully revealed - every clue, lever, and trap is shown below so you can see exactly how it
        could have been solved.
      </div>
      <div className="game-session__main">
        <Board map={map} state={state} onTileClick={() => {}} scanMode={false} revealAll />
        <aside className="game-session__sidebar">
          <ClueLog state={state} />
        </aside>
      </div>
    </div>
  );
}
