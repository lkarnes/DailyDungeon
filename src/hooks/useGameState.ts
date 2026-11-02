/** React hook wrapping the per-run game state machine (movement, clues, hints, win/loss). */
import { useCallback, useMemo, useReducer } from 'react';
import type { ClueData, DungeonMap, Position } from '../game/types';
import { posKey, samePos, DIRECTIONS } from '../game/types';
import { buildSummary, type RunSummary } from '../game/scoring';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type LogEntry =
  | { kind: 'clue'; clue: ClueData }
  | { kind: 'event'; text: string };

export interface GameState {
  map: DungeonMap;
  playerPos: Position;
  visited: Set<string>;
  discoveredClueIds: Set<string>;
  hasKey: boolean;
  collectedCollectibles: Set<string>;
  flagged: Set<string>;
  movesUsed: number;
  hintsUsed: number;
  scansRemaining: number;
  scannedSafe: Set<string>;
  scannedTrap: Set<string>;
  status: 'playing' | 'won' | 'lost';
  log: LogEntry[];
  revealedTraps: Set<string>;
}

type Action =
  | { type: 'MOVE'; dir: Direction }
  | { type: 'TOGGLE_FLAG'; pos: Position }
  | { type: 'SCAN'; pos: Position };

const MAX_SCANS = 3;

function initialState(map: DungeonMap): GameState {
  return {
    map,
    playerPos: map.start,
    visited: new Set([posKey(map.start)]),
    discoveredClueIds: new Set(),
    hasKey: false,
    collectedCollectibles: new Set(),
    flagged: new Set(),
    movesUsed: 0,
    hintsUsed: 0,
    scansRemaining: MAX_SCANS,
    scannedSafe: new Set(),
    scannedTrap: new Set(),
    status: 'playing',
    log: [],
    revealedTraps: new Set(),
  };
}

function reducer(state: GameState, action: Action): GameState {
  if (state.status !== 'playing' && action.type === 'MOVE') return state;

  if (action.type === 'TOGGLE_FLAG') {
    if (state.status !== 'playing') return state;
    const k = posKey(action.pos);
    if (k === posKey(state.playerPos)) return state;
    const flagged = new Set(state.flagged);
    if (flagged.has(k)) flagged.delete(k);
    else flagged.add(k);
    return { ...state, flagged };
  }

  if (action.type === 'SCAN') {
    if (state.status !== 'playing' || state.scansRemaining <= 0) return state;
    const k = posKey(action.pos);
    if (state.visited.has(k) || state.scannedSafe.has(k) || state.scannedTrap.has(k)) return state;
    const isTrap = state.map.traps.some((t) => posKey(t) === k);
    const scannedSafe = new Set(state.scannedSafe);
    const scannedTrap = new Set(state.scannedTrap);
    if (isTrap) scannedTrap.add(k);
    else scannedSafe.add(k);
    return {
      ...state,
      scansRemaining: state.scansRemaining - 1,
      hintsUsed: state.hintsUsed + 1,
      scannedSafe,
      scannedTrap,
      log: [...state.log, { kind: 'event', text: isTrap ? 'Scan result: a trap lurks there!' : 'Scan result: that tile is safe.' }],
    };
  }

  if (action.type === 'MOVE') {
    const d = DIRECTIONS.find((dd) => dd.name === action.dir)!;
    const target: Position = { row: state.playerPos.row + d.dr, col: state.playerPos.col + d.dc };
    const { map } = state;
    if (target.row < 0 || target.row >= map.rows || target.col < 0 || target.col >= map.cols) return state;
    if (map.terrain[target.row][target.col] === 'wall') return state;

    const targetKey = posKey(target);
    const isDoor = map.door && posKey(map.door) === targetKey;
    if (isDoor && !state.hasKey) {
      return { ...state, log: [...state.log, { kind: 'event', text: 'The door is locked. You need to find the key first.' }] };
    }

    const movesUsed = state.movesUsed + 1;
    const visited = new Set(state.visited);
    visited.add(targetKey);

    let hasKey = state.hasKey;
    const collectedCollectibles = new Set(state.collectedCollectibles);
    const discoveredClueIds = new Set(state.discoveredClueIds);
    const log = [...state.log];

    if (map.key && posKey(map.key) === targetKey && !hasKey) {
      hasKey = true;
      log.push({ kind: 'event', text: 'You found the key!' });
    }
    if (map.collectibles.some((c) => posKey(c) === targetKey) && !collectedCollectibles.has(targetKey)) {
      collectedCollectibles.add(targetKey);
      log.push({ kind: 'event', text: 'You found a hidden treasure!' });
    }
    const cluesHere = map.clues.filter((c) => posKey(c.tile) === targetKey);
    for (const clue of cluesHere) {
      if (!discoveredClueIds.has(clue.id)) {
        discoveredClueIds.add(clue.id);
        log.push({ kind: 'clue', clue });
      }
    }

    const isTrap = map.traps.some((t) => posKey(t) === targetKey);
    if (isTrap) {
      return {
        ...state,
        playerPos: target,
        visited,
        hasKey,
        collectedCollectibles,
        discoveredClueIds,
        movesUsed,
        status: 'lost',
        log: [...log, { kind: 'event', text: 'You triggered a hidden trap! The run ends here.' }],
        revealedTraps: new Set(map.traps.map(posKey)),
      };
    }

    const won = samePos(target, map.exit);
    return {
      ...state,
      playerPos: target,
      visited,
      hasKey,
      collectedCollectibles,
      discoveredClueIds,
      movesUsed,
      status: won ? 'won' : 'playing',
      log: won ? [...log, { kind: 'event', text: 'You escaped the dungeon!' }] : log,
      revealedTraps: won ? new Set(map.traps.map(posKey)) : state.revealedTraps,
    };
  }

  return state;
}

export function useGameState(map: DungeonMap) {
  const [state, dispatch] = useReducer(reducer, map, initialState);

  const move = useCallback((dir: Direction) => dispatch({ type: 'MOVE', dir }), []);
  const toggleFlag = useCallback((pos: Position) => dispatch({ type: 'TOGGLE_FLAG', pos }), []);
  const scan = useCallback((pos: Position) => dispatch({ type: 'SCAN', pos }), []);

  const summary: RunSummary | null = useMemo(() => {
    if (state.status === 'playing') return null;
    return buildSummary(map, {
      completed: state.status === 'won',
      trapTriggered: state.status === 'lost',
      movesUsed: state.movesUsed,
      cluesDiscovered: state.discoveredClueIds.size,
      collectiblesFound: state.collectedCollectibles.size,
      hintsUsed: state.hintsUsed,
    });
  }, [state, map]);

  return { state, move, toggleFlag, scan, summary };
}
