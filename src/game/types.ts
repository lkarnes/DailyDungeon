/** Core shared types for the Daily Dungeon game engine. */

export interface Position {
  row: number;
  col: number;
}

export type TileTerrain = 'floor' | 'wall';

export type ClueKind =
  | 'numerical'
  | 'specific'
  | 'proximity'
  | 'environmental'
  | 'directional'
  | 'connection';

export interface ClueData {
  id: string;
  kind: ClueKind;
  tile: Position;
  text: string;
  /** Whether this clue's constraint was actually used by the solver to prove a safe route. */
  loadBearing: boolean;
}

export interface DungeonMap {
  seed: string;
  dateKey: string;
  epoch: number;
  rows: number;
  cols: number;
  difficultyLabel: string;
  terrain: TileTerrain[][];
  start: Position;
  exit: Position;
  traps: Position[];
  trapCount: number;
  key?: Position;
  door?: Position;
  collectibles: Position[];
  clues: ClueData[];
  /** Minimum number of moves required to reach the exit safely (accounting for key/door). */
  optimalMoves: number;
  optimalPath: Position[];
}

export function posKey(p: Position): string {
  return `${p.row},${p.col}`;
}

export function keyToPos(key: string): Position {
  const [row, col] = key.split(',').map(Number);
  return { row, col };
}

export function samePos(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function manhattan(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

export function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

export const DIRECTIONS: { name: 'up' | 'down' | 'left' | 'right'; dr: number; dc: number }[] = [
  { name: 'up', dr: -1, dc: 0 },
  { name: 'down', dr: 1, dc: 0 },
  { name: 'left', dr: 0, dc: -1 },
  { name: 'right', dr: 0, dc: 1 },
];

export function neighbors4(p: Position): Position[] {
  return DIRECTIONS.map((d) => ({ row: p.row + d.dr, col: p.col + d.dc }));
}

export function neighbors8(p: Position): Position[] {
  const out: Position[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      out.push({ row: p.row + dr, col: p.col + dc });
    }
  }
  return out;
}
