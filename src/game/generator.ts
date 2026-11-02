/**
 * Top-level dungeon map generator. Orchestrates cave generation, start/exit
 * placement, trap placement, optional key/door gating, collectibles, clue
 * generation, and solver validation - retrying with a fresh seed derivative
 * whenever a step fails the fairness checks.
 */
import type { DungeonMap, Gate, Position, TileTerrain } from './types';
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

const MAX_ATTEMPTS = 800;

/** BFS over floor tiles reachable from `origin`, treating every tile in `blocked` as impassable. */
function regionFrom(terrain: TileTerrain[][], origin: Position, blocked: Set<string>): Set<string> {
  const rows = terrain.length;
  const cols = terrain[0].length;
  const visited = new Set<string>([posKey(origin)]);
  const queue: Position[] = [origin];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const np = { row: cur.row + dr, col: cur.col + dc };
      if (np.row < 0 || np.row >= rows || np.col < 0 || np.col >= cols || terrain[np.row][np.col] === 'wall') continue;
      const nk = posKey(np);
      if (blocked.has(nk) || visited.has(nk)) continue;
      visited.add(nk);
      queue.push(np);
    }
  }
  return visited;
}

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
      const reachableFromStart = regionFrom(terrain, start, new Set([...trapSet, posKey(door)]));
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

  // Optional hidden switch / blocked-tile gates: a separate mechanic from key/door.
  // Each gate is placed at a genuine chokepoint, treating all previously-placed
  // gates as still closed, so gates naturally nest (you must clear gate 1 before
  // gate 2's chokepoint even becomes reachable to test/use). Every gate also
  // reserves a distinct host tile for a guaranteed clue pointing at its switch.
  const gates: Gate[] = [];
  const gateClueHosts: Position[] = [];
  {
    const [minGates, maxGates] = difficulty.gateCountRange;
    const targetGateCount = maxGates > 0 ? rng.intRange(minGates, maxGates) : 0;
    const reservedSoFar = new Set<string>([posKey(start), posKey(exit), ...traps.map(posKey)]);
    if (keyPos) reservedSoFar.add(posKey(keyPos));
    if (doorPos) reservedSoFar.add(posKey(doorPos));
    const closedForTesting = new Set<string>(trapSet);

    for (let i = 0; i < targetGateCount; i++) {
      const safeFloorForGate = region.filter((p) => !closedForTesting.has(posKey(p)));
      if (safeFloorForGate.length === 0) break;
      const cuts = findArticulationPoints(terrain, safeFloorForGate);
      const validCuts = cuts.filter((cut) => {
        if (reservedSoFar.has(posKey(cut))) return false;
        const testBlocked = new Set(closedForTesting);
        testBlocked.add(posKey(cut));
        return bfsPath(terrain, start, exit, testBlocked) === null;
      });
      if (validCuts.length === 0) break;
      const blockedPos = rng.pick(validCuts);
      const testBlocked = new Set(closedForTesting);
      testBlocked.add(posKey(blockedPos));
      const reachable = Array.from(regionFrom(terrain, start, testBlocked))
        .map((k) => {
          const [row, col] = k.split(',').map(Number);
          return { row, col };
        })
        .filter((p) => !reservedSoFar.has(posKey(p)) && posKey(p) !== posKey(blockedPos));
      if (reachable.length < 2) break;
      const shuffledReachable = rng.shuffle(reachable);
      const switchPos = shuffledReachable[0];
      const clueHostPos = shuffledReachable[1];

      gates.push({ switchPos, blockedPos });
      gateClueHosts.push(clueHostPos);
      reservedSoFar.add(posKey(switchPos));
      reservedSoFar.add(posKey(blockedPos));
      reservedSoFar.add(posKey(clueHostPos));
      closedForTesting.add(posKey(blockedPos));
    }

    // If this difficulty mandates a minimum number of gates but this particular
    // cave layout didn't have enough genuine chokepoints to place them all,
    // reject the attempt so the outer retry loop tries a different seed/layout
    // instead of silently publishing a dungeon with fewer gates than intended.
    if (gates.length < minGates) return null;
  }

  // Permanently impassable obstacles (never clearable by any switch) - added after
  // traps/key/door/gates are finalized, each one verified not to break the overall
  // route (including all gates), to add maze complexity and length without risking
  // an unsolvable map. Visually distinct from both plain cave walls and the
  // switch-removable rubble gates above.
  const permanentBlocks: Position[] = [];
  {
    const reservedForBlocks = new Set<string>([posKey(start), posKey(exit), ...traps.map(posKey)]);
    if (keyPos) reservedForBlocks.add(posKey(keyPos));
    if (doorPos) reservedForBlocks.add(posKey(doorPos));
    gates.forEach((g) => {
      reservedForBlocks.add(posKey(g.switchPos));
      reservedForBlocks.add(posKey(g.blockedPos));
    });
    gateClueHosts.forEach((p) => reservedForBlocks.add(posKey(p)));

    const candidatesForBlocks = region.filter((p) => {
      if (reservedForBlocks.has(posKey(p))) return false;
      if (chebyshevDist(p, start) <= 1 || chebyshevDist(p, exit) <= 1) return false;
      return true;
    });
    const shuffledBlockCandidates = rng.shuffle(candidatesForBlocks);
    const targetBlockCount = Math.round(region.length * difficulty.permanentBlockRate);

    for (const candidate of shuffledBlockCandidates) {
      if (permanentBlocks.length >= targetBlockCount) break;
      const prevTerrain = terrain[candidate.row][candidate.col];
      terrain[candidate.row][candidate.col] = 'wall';
      const stillHasFullRoute = bfsPathWithKey(terrain, start, exit, trapSet, keyPos, doorPos, gates) !== null;
      const switchesStillReachable = gates.every((g) => bfsPath(terrain, start, g.switchPos, trapSet) !== null);
      if (stillHasFullRoute && switchesStillReachable) {
        permanentBlocks.push(candidate);
      } else {
        terrain[candidate.row][candidate.col] = prevTerrain;
      }
    }
  }
  const permanentBlockSet = new Set(permanentBlocks.map(posKey));
  const regionAfterBlocks = region.filter((p) => !permanentBlockSet.has(posKey(p)));

  // Verify the (possibly key/door- and gate-gated) map is still completable.
  const blockedForFinal = new Set(trapSet);
  const finalPath = bfsPathWithKey(terrain, start, exit, blockedForFinal, keyPos, doorPos, gates);
  if (!finalPath) return null;

  // Collectibles: optional, cosmetic score bonus, never blocking.
  const reserved = new Set([posKey(start), posKey(exit), ...traps.map(posKey)]);
  if (keyPos) reserved.add(posKey(keyPos));
  if (doorPos) reserved.add(posKey(doorPos));
  gates.forEach((g) => {
    reserved.add(posKey(g.switchPos));
    reserved.add(posKey(g.blockedPos));
  });
  gateClueHosts.forEach((p) => reserved.add(posKey(p)));
  const collectiblePool = rng.shuffle(regionAfterBlocks.filter((p) => !reserved.has(posKey(p))));
  const collectibles = collectiblePool.slice(0, difficulty.collectibleCount);
  collectibles.forEach((c) => reserved.add(posKey(c)));

  const floorKeys = regionAfterBlocks
    .map(posKey)
    .filter(
      (k) =>
        k !== posKey(start) &&
        k !== posKey(exit) &&
        k !== (keyPos ? posKey(keyPos) : '') &&
        k !== (doorPos ? posKey(doorPos) : '') &&
        !gates.some((g) => posKey(g.switchPos) === k || posKey(g.blockedPos) === k),
    );

  const gateInfos = gates.map((g, i) => ({ gate: g, clueHostPos: gateClueHosts[i] }));
  const { clues, solvable } = generateClues(terrain, rows, cols, start, exit, traps, floorKeys, rng, keyPos, doorPos, gateInfos);
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
    gates,
    permanentBlocks,
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
  // Extremely unlikely fallback: shrink difficulty and try again without key/door or gates.
  const fallbackDifficulty: DungeonDifficulty = {
    ...difficulty,
    rows: 9,
    cols: 9,
    allowKeyDoor: false,
    keyDoorChance: 0,
    gateCountRange: [0, 0],
    permanentBlockRate: 0,
  };
  const fallbackMap = generateWithRetries(dateKey, fallbackDifficulty, (attempt) => getDailySeed(`${dateKey}-fallback`, attempt));
  if (fallbackMap) return fallbackMap;
  throw new Error('Failed to generate a valid Daily Dungeon map after exhausting all attempts.');
}
