/**
 * Grid-level helpers: cave generation (cellular automaton), connectivity,
 * shortest paths (plain and key/door aware), and articulation-point
 * detection used to place a fair key/door gate.
 */
import type { Gate, Position, TileTerrain } from './types';
import { posKey } from './types';
import type { SeededRandom } from './rng';

export type Grid<T> = T[][];

export function inBounds(rows: number, cols: number, p: Position): boolean {
  return p.row >= 0 && p.row < rows && p.col >= 0 && p.col < cols;
}

/** Generates a cave-like layout via cellular automaton smoothing. Returns true = wall. */
export function generateCaveWalls(rng: SeededRandom, rows: number, cols: number, wallProb = 0.45, iterations = 5): boolean[][] {
  let grid: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    grid.push([]);
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
      grid[r].push(isBorder ? true : rng.chance(wallProb));
    }
  }

  const countWallNeighbors = (g: boolean[][], r: number, c: number): number => {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || g[nr][nc]) count++;
      }
    }
    return count;
  };

  for (let it = 0; it < iterations; it++) {
    const next: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      next.push([]);
      for (let c = 0; c < cols; c++) {
        const isBorder = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
        if (isBorder) {
          next[r].push(true);
          continue;
        }
        const wallNeighbors = countWallNeighbors(grid, r, c);
        if (wallNeighbors >= 5) next[r].push(true);
        else if (wallNeighbors <= 3) next[r].push(false);
        else next[r].push(grid[r][c]);
      }
    }
    grid = next;
  }
  return grid;
}

/** Flood-fills from a seed tile over floor cells (walls==true are impassable). Returns the connected region. */
export function floodFillFloor(walls: boolean[][], start: Position): Position[] {
  const rows = walls.length;
  const cols = walls[0].length;
  if (walls[start.row][start.col]) return [];
  const visited = new Set<string>([posKey(start)]);
  const queue: Position[] = [start];
  const region: Position[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    region.push(cur);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const np = { row: cur.row + dr, col: cur.col + dc };
      if (!inBounds(rows, cols, np) || walls[np.row][np.col]) continue;
      const k = posKey(np);
      if (visited.has(k)) continue;
      visited.add(k);
      queue.push(np);
    }
  }
  return region;
}

/** Finds the largest connected floor region in the wall grid and returns a terrain grid with everything else turned to wall. */
export function keepLargestFloorRegion(walls: boolean[][]): { terrain: TileTerrain[][]; region: Position[] } {
  const rows = walls.length;
  const cols = walls[0].length;
  const visited = new Set<string>();
  let best: Position[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (walls[r][c]) continue;
      const k = posKey({ row: r, col: c });
      if (visited.has(k)) continue;
      const region = floodFillFloor(walls, { row: r, col: c });
      region.forEach((p) => visited.add(posKey(p)));
      if (region.length > best.length) best = region;
    }
  }
  const bestSet = new Set(best.map(posKey));
  const terrain: TileTerrain[][] = [];
  for (let r = 0; r < rows; r++) {
    terrain.push([]);
    for (let c = 0; c < cols; c++) {
      terrain[r].push(bestSet.has(posKey({ row: r, col: c })) ? 'floor' : 'wall');
    }
  }
  return { terrain, region: best };
}

/**
 * Multi-destination BFS distance map from `origin` over all non-wall tiles
 * (ignoring traps/gates - purely structural). Used to classify each of the
 * player's moves as "progress" or "detour" for the shareable results trail;
 * since wall layout is visible to the player from the start, this distance
 * is never a spoiler.
 */
export function bfsDistanceMap(terrain: TileTerrain[][], origin: Position): Map<string, number> {
  const rows = terrain.length;
  const cols = terrain[0].length;
  const dist = new Map<string, number>([[posKey(origin), 0]]);
  const queue: Position[] = [origin];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const curDist = dist.get(posKey(cur))!;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const np = { row: cur.row + dr, col: cur.col + dc };
      if (!inBounds(rows, cols, np) || terrain[np.row][np.col] === 'wall') continue;
      const nk = posKey(np);
      if (dist.has(nk)) continue;
      dist.set(nk, curDist + 1);
      queue.push(np);
    }
  }
  return dist;
}

/** Plain BFS shortest path over floor tiles, optionally excluding a set of blocked tiles. Returns null if unreachable. */
export function bfsPath(
  terrain: TileTerrain[][],
  start: Position,
  goal: Position,
  blocked: Set<string> = new Set(),
): Position[] | null {
  const rows = terrain.length;
  const cols = terrain[0].length;
  const startKey = posKey(start);
  const goalKey = posKey(goal);
  if (blocked.has(startKey) || blocked.has(goalKey)) return null;
  const prev = new Map<string, string | null>();
  prev.set(startKey, null);
  const queue: Position[] = [start];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const curKey = posKey(cur);
    if (curKey === goalKey) break;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const np = { row: cur.row + dr, col: cur.col + dc };
      if (!inBounds(rows, cols, np) || terrain[np.row][np.col] === 'wall') continue;
      const nk = posKey(np);
      if (blocked.has(nk) || prev.has(nk)) continue;
      prev.set(nk, curKey);
      queue.push(np);
    }
  }
  if (!prev.has(goalKey)) return null;
  const path: Position[] = [];
  let curKey: string | null = goalKey;
  while (curKey !== null) {
    const [r, c] = curKey.split(',').map(Number);
    path.push({ row: r, col: c });
    curKey = prev.get(curKey) ?? null;
  }
  path.reverse();
  return path;
}

/**
 * BFS over the state space (tile, hasKey) so that a locked door is only
 * traversable after the key tile has been visited. Falls back to a plain
 * walk if there is no key/door on this map.
 *
 * `gates` adds an independent set of hidden switch/blocked-tile pairs: a
 * `blockedPos` tile is impassable until its paired `switchPos` tile has been
 * visited. Gate count is expected to stay small (0-3), so the activation
 * state is tracked as a bitmask.
 */
export function bfsPathWithKey(
  terrain: TileTerrain[][],
  start: Position,
  goal: Position,
  blocked: Set<string>,
  keyPos?: Position,
  doorPos?: Position,
  gates: Gate[] = [],
): Position[] | null {
  if (!keyPos && !doorPos && gates.length === 0) return bfsPath(terrain, start, goal, blocked);
  const rows = terrain.length;
  const cols = terrain[0].length;
  const doorKey = doorPos ? posKey(doorPos) : null;
  const keyK = keyPos ? posKey(keyPos) : null;
  const gateBlockedKeys = gates.map((g) => posKey(g.blockedPos));
  const gateSwitchKeys = gates.map((g) => posKey(g.switchPos));

  const initialMask = gateSwitchKeys.reduce((mask, sk, i) => (posKey(start) === sk ? mask | (1 << i) : mask), 0);
  const stateKey = (p: Position, hasKey: boolean, mask: number) => `${posKey(p)}|${hasKey ? 1 : 0}|${mask}`;
  const startHasKey = keyK !== null && posKey(start) === keyK;
  const startState = stateKey(start, startHasKey, initialMask);
  const prev = new Map<string, string | null>();
  prev.set(startState, null);
  const queue: { p: Position; hasKey: boolean; mask: number }[] = [{ p: start, hasKey: startHasKey, mask: initialMask }];
  let qi = 0;
  let goalState: string | null = null;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const curKey = posKey(cur.p);
    if (curKey === posKey(goal)) {
      goalState = stateKey(cur.p, cur.hasKey, cur.mask);
      break;
    }
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const np = { row: cur.p.row + dr, col: cur.p.col + dc };
      if (!inBounds(rows, cols, np) || terrain[np.row][np.col] === 'wall') continue;
      const nk = posKey(np);
      if (blocked.has(nk)) continue;
      if (nk === doorKey && !cur.hasKey) continue; // locked door
      const gateIdx = gateBlockedKeys.indexOf(nk);
      if (gateIdx !== -1 && !(cur.mask & (1 << gateIdx))) continue; // rubble not yet cleared
      const nextHasKey = cur.hasKey || nk === keyK;
      const switchIdx = gateSwitchKeys.indexOf(nk);
      const nextMask = switchIdx !== -1 ? cur.mask | (1 << switchIdx) : cur.mask;
      const ns = stateKey(np, nextHasKey, nextMask);
      if (prev.has(ns)) continue;
      prev.set(ns, stateKey(cur.p, cur.hasKey, cur.mask));
      queue.push({ p: np, hasKey: nextHasKey, mask: nextMask });
    }
  }
  if (goalState === null) return null;
  const path: Position[] = [];
  let cur: string | null = goalState;
  while (cur !== null) {
    const [posPart] = cur.split('|');
    const [r, c] = posPart.split(',').map(Number);
    path.push({ row: r, col: c });
    cur = prev.get(cur) ?? null;
  }
  path.reverse();
  return path;
}

/**
 * Finds articulation points (cut vertices) of the floor graph restricted to
 * `nodes`, using the classic DFS low-link algorithm. Used to find fair
 * chokepoints for an optional locked door.
 */
export function findArticulationPoints(terrain: TileTerrain[][], nodes: Position[]): Position[] {
  const rows = terrain.length;
  const cols = terrain[0].length;
  const nodeSet = new Set(nodes.map(posKey));
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const result = new Set<string>();
  let timer = 0;

  const adj = (k: string): string[] => {
    const [r, c] = k.split(',').map(Number);
    const out: string[] = [];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const np = { row: r + dr, col: c + dc };
      if (!inBounds(rows, cols, np) || terrain[np.row][np.col] === 'wall') continue;
      const nk = posKey(np);
      if (nodeSet.has(nk)) out.push(nk);
    }
    return out;
  };

  function dfs(u: string): void {
    disc.set(u, timer);
    low.set(u, timer);
    timer++;
    let children = 0;
    for (const v of adj(u)) {
      if (!disc.has(v)) {
        children++;
        parent.set(v, u);
        dfs(v);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        const isRoot = parent.get(u) === undefined || parent.get(u) === null;
        if (!isRoot && low.get(v)! >= disc.get(u)!) result.add(u);
        if (isRoot && children > 1) result.add(u);
      } else if (v !== parent.get(u)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  }

  const rootKey = posKey(nodes[0]);
  parent.set(rootKey, null);
  dfs(rootKey);
  return Array.from(result).map((k) => {
    const [r, c] = k.split(',').map(Number);
    return { row: r, col: c };
  });
}
