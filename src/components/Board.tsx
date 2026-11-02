/**
 * Renders the dungeon grid: terrain, player, items, flags, and (post-game) revealed
 * traps. Clue markers are fog-of-war'd for *unvisited* tiles only - once you've
 * stood on a tile, its clue marker stays visible permanently, so you can always
 * see on the map where each of your Clue Log entries came from. Permanently
 * blocked "boulder" tiles are visually distinct from both plain cave walls and
 * switch-clearable rubble gates.
 */
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
  const blockedTileGate = new Map(map.gates.map((g, i) => [posKey(g.blockedPos), i]));
  const switchTileGate = new Map(map.gates.map((g, i) => [posKey(g.switchPos), i]));
  const permanentBlockKeys = new Set(map.permanentBlocks.map(posKey));
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
          const isPermanentBlock = permanentBlockKeys.has(k);
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
          // Fog of war: clue markers are hidden on unvisited tiles (so you can't see
          // every clue location and trace a path without exploring), but once you've
          // visited a tile its marker stays visible permanently, so you can always
          // find your way back to where a Clue Log entry came from.
          const showClueHere = isVisited && cluesHere.length > 0;
          const hasKeyItem = keyKey === k && !state.hasKey;
          const isDoorTile = doorKey === k;
          const gateIdxForBlocked = blockedTileGate.get(k);
          const isBlockedTile = gateIdxForBlocked !== undefined && !state.activatedGates.has(gateIdxForBlocked);
          const isClearedGateTile = gateIdxForBlocked !== undefined && state.activatedGates.has(gateIdxForBlocked) && isVisited;
          const gateIdxForSwitch = switchTileGate.get(k);
          const isActivatedSwitch = gateIdxForSwitch !== undefined && state.activatedGates.has(gateIdxForSwitch);
          const hasCollectible = collectibleKeys.has(k) && !state.collectedCollectibles.has(k);

          const classes = [
            'tile',
            isWall ? 'tile--wall' : 'tile--floor',
            isPermanentBlock ? 'tile--boulder' : '',
            isVisited ? 'tile--visited' : '',
            isFlagged ? 'tile--flagged' : '',
            scanMode && !isWall && !isVisited ? 'tile--scannable' : '',
            isTrapRevealed ? 'tile--trap-revealed' : '',
            scannedSafe ? 'tile--scanned-safe' : '',
            scannedTrap ? 'tile--scanned-trap' : '',
            isBlockedTile ? 'tile--blocked' : '',
          ]
            .filter(Boolean)
            .join(' ');

          let icon: string | null = null;
          let title = '';
          if (isPermanentBlock) {
            icon = '⛔';
            title = 'Impassable rubble';
          } else if (!isWall) {
            if (isTrapRevealed) {
              icon = '💀';
              title = 'Trap';
            } else if (isExit) {
              icon = '🚪';
              title = 'Exit';
            } else if (isDoorTile && !state.hasKey) {
              icon = '🔒';
              title = 'Locked door';
            } else if (isBlockedTile) {
              icon = '🪨';
              title = 'Blocked by rubble';
            } else if (hasKeyItem) {
              icon = '🔑';
              title = 'Key';
            } else if (hasCollectible) {
              icon = '💎';
              title = 'Treasure';
            } else if (showClueHere) {
              icon = '📖';
              title = cluesHere.length > 1 ? `${cluesHere.length} clues here` : `${cluesHere[0].kind} clue`;
            } else if (isActivatedSwitch) {
              icon = '🕹️';
              title = 'Lever (pulled)';
            } else if (isClearedGateTile) {
              icon = '✅';
              title = 'Cleared passage (lever pulled elsewhere)';
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
              {showClueHere && cluesHere.length > 1 && <span className="tile__clue-count">{cluesHere.length}</span>}
              {isPlayer && <span className="tile__player">🧙</span>}
            </button>
          );
        }),
      )}
    </div>
  );
}
