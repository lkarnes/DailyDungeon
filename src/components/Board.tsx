/** Renders the dungeon grid: terrain, player, items, clue markers, flags, and (post-game) revealed traps. */
import type { DungeonMap, Position } from '../game/types';
import { posKey } from '../game/types';
import type { GameState } from '../hooks/useGameState';

interface BoardProps {
  map: DungeonMap;
  state: GameState;
  onTileClick: (pos: Position) => void;
  scanMode: boolean;
}

export function Board({ map, state, onTileClick, scanMode }: BoardProps) {
  const playerKey = posKey(state.playerPos);
  const startKey = posKey(map.start);
  const exitKey = posKey(map.exit);
  const keyKey = map.key ? posKey(map.key) : null;
  const doorKey = map.door ? posKey(map.door) : null;
  const collectibleKeys = new Set(map.collectibles.map(posKey));
  const cluesByTile = new Map<string, typeof map.clues>();
  for (const clue of map.clues) {
    const k = posKey(clue.tile);
    if (!cluesByTile.has(k)) cluesByTile.set(k, []);
    cluesByTile.get(k)!.push(clue);
  }

  return (
    <div
      className="board"
      style={{ gridTemplateColumns: `repeat(${map.cols}, 1fr)`, gridTemplateRows: `repeat(${map.rows}, 1fr)` }}
      role="grid"
      aria-label="Dungeon grid"
    >
      {map.terrain.map((row, r) =>
        row.map((terrain, c) => {
          const pos = { row: r, col: c };
          const k = posKey(pos);
          const isWall = terrain === 'wall';
          const isPlayer = k === playerKey;
          const isStart = k === startKey;
          const isExit = k === exitKey;
          const isVisited = state.visited.has(k);
          const isFlagged = state.flagged.has(k);
          const isTrapRevealed = state.revealedTraps.has(k);
          const scannedSafe = state.scannedSafe.has(k);
          const scannedTrap = state.scannedTrap.has(k);
          const cluesHere = cluesByTile.get(k) ?? [];
          const anyUndiscovered = cluesHere.some((c) => !state.discoveredClueIds.has(c.id));
          const allDiscovered = cluesHere.length > 0 && !anyUndiscovered;
          const hasKeyItem = keyKey === k && !state.hasKey;
          const isDoorTile = doorKey === k;
          const hasCollectible = collectibleKeys.has(k) && !state.collectedCollectibles.has(k);

          const classes = [
            'tile',
            isWall ? 'tile--wall' : 'tile--floor',
            isVisited ? 'tile--visited' : '',
            isFlagged ? 'tile--flagged' : '',
            scanMode && !isWall && !isVisited ? 'tile--scannable' : '',
            isTrapRevealed ? 'tile--trap-revealed' : '',
            scannedSafe ? 'tile--scanned-safe' : '',
            scannedTrap ? 'tile--scanned-trap' : '',
          ]
            .filter(Boolean)
            .join(' ');

          let icon: string | null = null;
          let title = '';
          if (!isWall) {
            if (isTrapRevealed) {
              icon = '💀';
              title = 'Trap';
            } else if (isExit) {
              icon = '🚪';
              title = 'Exit';
            } else if (isDoorTile && !state.hasKey) {
              icon = '🔒';
              title = 'Locked door';
            } else if (hasKeyItem) {
              icon = '🔑';
              title = 'Key';
            } else if (hasCollectible) {
              icon = '💎';
              title = 'Treasure';
            } else if (cluesHere.length > 0 && anyUndiscovered) {
              icon = '📜';
              title = `${cluesHere.length > 1 ? `${cluesHere.length} clues` : `${cluesHere[0].kind} clue`} (undiscovered)`;
            } else if (allDiscovered) {
              icon = '📖';
              title = `${cluesHere.length > 1 ? `${cluesHere.length} clues` : `${cluesHere[0].kind} clue`} (read)`;
            } else if (isStart) {
              icon = '🏁';
              title = 'Start';
            } else if (scannedTrap) {
              icon = '⚠️';
              title = 'Scanned: trap';
            } else if (scannedSafe) {
              icon = '✓';
              title = 'Scanned: safe';
            }
          }

          return (
            <button
              key={k}
              type="button"
              className={classes}
              onClick={() => onTileClick(pos)}
              disabled={isWall}
              aria-label={title || (isWall ? 'Wall' : 'Floor')}
            >
              {isFlagged && !isPlayer && <span className="tile__flag">🚩</span>}
              {icon && <span className="tile__icon">{icon}</span>}
              {cluesHere.length > 1 && <span className="tile__clue-count">{cluesHere.length}</span>}
              {isPlayer && <span className="tile__player">🧙</span>}
            </button>
          );
        }),
      )}
    </div>
  );
}
