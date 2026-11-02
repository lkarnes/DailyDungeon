/**
 * Top-level dungeon map generator. Orchestrates cave generation, start/exit
 * placement, trap placement, optional key/door gating, collectibles, clue
 * generation, and solver validation - retrying with a fresh seed derivative
 * whenever a step fails the fairness checks.
 */
import type { DungeonMap, Position, TileTerrain } from './types';
import { posKey } from './types';
import { SeededRandom } from './rng';
import { getDailySeed, getEpoch, getDifficultyForDate, type DungeonDifficulty } from './seed';
import {
  generateCaveWalls,
  keepLargestFloorRegion,
  bfsPath,
  bfsPathWithKey,
  findArticulationPoints,
} from './grid';
import { generateClues } from './clues';

const MAX_ATTEMPTS = 300;

function bfsFarthest(terrain: TileTerrain[][], from: Position): { pos: Position; dist: number } {
  const rows = terrain.length;
  const cols = terrain[0].length;
  const dist = new Map<string, number>([[posKey(from), 0]]);
  const queue: Position[] = [from];
  let qi = 0;
  let farthest = from;
  let farthestDist = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const curDist = dist.get(posKey(cur))!;
    if (curDist > farthestDist) {
      farthestDist = curDist;
      farthest = cur;
    }
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const np = { row: cur.row + dr, col: cur.col + dc };
      if (np.row < 0 || np.row >= rows || np.col < 0 || np.col >= cols || terrain[np.row][np.col] === 'wall') continue;
      const nk = posKey(np);
      if (dist.has(nk)) continue;
      dist.set(nk, curDist + 1);
      queue.push(np);
    }
  }
  return { pos: farthest, dist: farthestDist };
}

function chebyshevDist(a: Position, b: Position): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function manhattanDist(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function tryGenerate(seed: string, dateKey: string, difficulty: DungeonDifficulty): DungeonMap | null {
  const rng = new SeededRandom(seed);
  const { rows, cols } = difficulty;

  // Smaller grids need a lower initial wall probability for cellular automaton
  // smoothing to reliably leave one large connected cave (fewer cells means
  // fragmentation is much more likely at the "classic" 0.45 rate).
  const wallProb = Math.min(rows, cols) <= 9 ? 0.4 : 0.45;
  const walls = generateCaveWalls(rng, rows, cols, wallProb);
  const { terrain, region } = keepLargestFloorRegion(walls);
  if (region.length < rows * cols * 0.3) return null;

  // Find a long start/exit pair via double BFS (approximate graph diameter).
  const seedTile = region[rng.int(region.length)];
  const a = bfsFarthest(terrain, seedTile);
  const b = bfsFarthest(terrain, a.pos);
  if (b.dist < Math.max(7, Math.floor(Math.min(rows, cols) * 0.7))) return null;
  const start = a.pos;
  const exit = b.pos;

  // Trap placement with light spacing preference.
  const trapCount = Math.max(5, Math.min(22, Math.round(region.length * difficulty.trapRate)));
  const candidates = region.filter(
    (p) => !(p.row === start.row && p.col === start.col) && !(p.row === exit.row && p.col === exit.col) && chebyshevDist(p, start) > 1 && chebyshevDist(p, exit) > 1,
  );
  const shuffledCandidates = rng.shuffle(candidates);
  const traps: Position[] = [];
  for (const t of shuffledCandidates) {
    if (traps.length >= trapCount) break;
    if (traps.every((tr) => manhattanDist(tr, t) >= 2)) traps.push(t);
  }
  if (traps.length < trapCount) {
    for (const t of shuffledCandidates) {
      if (traps.length >= trapCount) break;
      if (!traps.some((tr) => tr.row === t.row && tr.col === t.col)) traps.push(t);
    }
  }
  const trapSet = new Set(traps.map(posKey));

  // Confirm a trap-free path exists at all.
  const basicPath = bfsPath(terrain, start, exit, trapSet);
  if (!basicPath) return null;

  // Optional key/door: find a fair chokepoint (articulation point separating start from exit).
  let keyPos: Position | undefined;
  let doorPos: Position | undefined;
  if (difficulty.allowKeyDoor && rng.chance(difficulty.keyDoorChance)) {
    const safeFloor = region.filter((p) => !trapSet.has(posKey(p)));
    const cuts = findArticulationPoints(terrain, safeFloor);
    const validDoors = cuts.filter((cut) => {
      const blocked = new Set([posKey(cut)]);
      const path = bfsPath(terrain, start, exit, blocked);
      return path === null; // removing it truly disconnects start from exit
    });
    if (validDoors.length > 0) {
      const door = rng.pick(validDoors);
      // Find start's side of the graph once the door is removed.
      const blocked = new Set([posKey(door)]);
      const reachableFromStart = new Set<string>();
      {
        const queue = [start];
        reachableFromStart.add(posKey(start));
        let qi = 0;
        while (qi < queue.length) {
          const cur = queue[qi++];
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const np = { row: cur.row + dr, col: cur.col + dc };
            if (np.row < 0 || np.row >= rows || np.col < 0 || np.col >= cols || terrain[np.row][np.col] === 'wall') continue;
            const nk = posKey(np);
            if (trapSet.has(nk) || blocked.has(nk) || reachableFromStart.has(nk)) continue;
            reachableFromStart.add(nk);
            queue.push(np);
          }
        }
      }
      const keyCandidates = Array.from(reachableFromStart)
        .filter((k) => k !== posKey(start) && k !== posKey(door))
        .map((k) => {
          const [row, col] = k.split(',').map(Number);
          return { row, col };
        });
      if (keyCandidates.length > 0) {
        keyPos = rng.pick(keyCandidates);
        doorPos = door;
      }
    }
  }

  // Verify the (possibly key/door-gated) map is still completable.
  const blockedForFinal = new Set(trapSet);
  const finalPath = bfsPathWithKey(terrain, start, exit, blockedForFinal, keyPos, doorPos);
  if (!finalPath) return null;

  // Collectibles: optional, cosmetic score bonus, never blocking.
  const reserved = new Set([posKey(start), posKey(exit), ...traps.map(posKey)]);
  if (keyPos) reserved.add(posKey(keyPos));
  if (doorPos) reserved.add(posKey(doorPos));
  const collectiblePool = rng.shuffle(region.filter((p) => !reserved.has(posKey(p))));
  const collectibles = collectiblePool.slice(0, difficulty.collectibleCount);
  collectibles.forEach((c) => reserved.add(posKey(c)));

  const floorKeys = region.map(posKey).filter((k) => k !== posKey(start) && k !== posKey(exit) && k !== (keyPos ? posKey(keyPos) : '') && k !== (doorPos ? posKey(doorPos) : ''));

  const { clues, solvable } = generateClues(terrain, rows, cols, start, exit, traps, floorKeys, rng, keyPos, doorPos);
  if (!solvable) return null;

  return {
    seed,
    dateKey,
    epoch: getEpoch(dateKey),
    rows,
    cols,
    difficultyLabel: difficulty.label,
    terrain,
    start,
    exit,
    traps,
    trapCount: traps.length,
    key: keyPos,
    door: doorPos,
    collectibles,
    clues,
    optimalMoves: finalPath.length - 1,
    optimalPath: finalPath,
  };
}

/** Exposed for one-off generation attempts (e.g. practice mode) that don't need the retry loop's seed scheme. */
export function tryGenerateFromSeed(seed: string, dateKey: string, difficulty: DungeonDifficulty): DungeonMap | null {
  return tryGenerate(seed, dateKey, difficulty);
}

/** Generates a map by trying many seed variants (built from `seedForAttempt`) until one passes all fairness checks. */
export function generateWithRetries(
  dateKey: string,
  difficulty: DungeonDifficulty,
  seedForAttempt: (attempt: number) => string,
): DungeonMap | null {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const map = tryGenerate(seedForAttempt(attempt), dateKey, difficulty);
    if (map) return map;
  }
  return null;
}

/** Generates (and validates) the dungeon map for a given date key, retrying with seed variants until one passes all fairness checks. */
export function generateDungeonMap(dateKey: string, date: Date): DungeonMap {
  const difficulty = getDifficultyForDate(date);
  const map = generateWithRetries(dateKey, difficulty, (attempt) => getDailySeed(dateKey, attempt));
  if (map) return map;
  // Extremely unlikely fallback: shrink difficulty and try again without key/door.
  const fallbackDifficulty: DungeonDifficulty = { ...difficulty, rows: 9, cols: 9, allowKeyDoor: false, keyDoorChance: 0 };
  const fallbackMap = generateWithRetries(dateKey, fallbackDifficulty, (attempt) => getDailySeed(`${dateKey}-fallback`, attempt));
  if (fallbackMap) return fallbackMap;
  throw new Error('Failed to generate a valid Daily Dungeon map after exhausting all attempts.');
}
