/**
 * Clue generation: builds human-readable clues whose factual payload is
 * always true for the given map, and incrementally feeds the load-bearing
 * ones (numerical, specific, proximity, environmental, directional) into the
 * solver until it can prove a safe route exists. "Connection" clues are
 * flavor-only (see solver.ts header comment).
 */
import type { ClueData, ClueKind, Position, TileTerrain } from './types';
import { neighbors4, neighbors8, posKey } from './types';
import type { SeededRandom } from './rng';
import { validateSolvable, type Constraint } from './solver';

interface ClueBuildContext {
  terrain: TileTerrain[][];
  rows: number;
  cols: number;
  trapSet: Set<string>;
  start: Position;
  exit: Position;
  keyPos?: Position;
  doorPos?: Position;
}

function isFloor(ctx: ClueBuildContext, p: Position): boolean {
  return p.row >= 0 && p.row < ctx.rows && p.col >= 0 && p.col < ctx.cols && ctx.terrain[p.row][p.col] === 'floor';
}

function describeOffset(from: Position, to: Position): string {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const parts: string[] = [];
  if (dr !== 0) parts.push(`${Math.abs(dr)} tile${Math.abs(dr) > 1 ? 's' : ''} ${dr < 0 ? 'north' : 'south'}`);
  if (dc !== 0) parts.push(`${Math.abs(dc)} tile${Math.abs(dc) > 1 ? 's' : ''} ${dc < 0 ? 'west' : 'east'}`);
  if (parts.length === 0) return 'right here';
  return `${parts.join(' and ')} from here`;
}

let clueCounter = 0;
function nextId(): string {
  clueCounter += 1;
  return `clue-${clueCounter}`;
}

interface BuiltClue {
  data: Omit<ClueData, 'loadBearing'>;
  constraint?: Constraint;
}

function buildNumericalClue(ctx: ClueBuildContext, tile: Position): BuiltClue | null {
  const cells = neighbors8(tile).filter((p) => isFloor(ctx, p));
  if (cells.length === 0) return null;
  const count = cells.filter((p) => ctx.trapSet.has(posKey(p))).length;
  const text =
    count === 0
      ? 'You study the surrounding floor carefully: none of the 8 tiles around this spot hide a trap.'
      : `There ${count === 1 ? 'is exactly 1 trap' : `are exactly ${count} traps`} among the 8 tiles surrounding this spot.`;
  return {
    data: { id: nextId(), kind: 'numerical', tile, text },
    constraint: { kind: 'exact', cells: cells.map(posKey), count },
  };
}

function buildProximityClue(ctx: ClueBuildContext, tile: Position, radius: number): BuiltClue | null {
  const cells: Position[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dr === 0 && dc === 0) continue;
      const p = { row: tile.row + dr, col: tile.col + dc };
      if (isFloor(ctx, p)) cells.push(p);
    }
  }
  const hasTrap = cells.some((p) => ctx.trapSet.has(posKey(p)));
  if (!hasTrap) return null; // statement would be false; not applicable here
  const text =
    radius === 1
      ? 'A trap is hidden somewhere within 1 tile of this spot. Tread carefully.'
      : `You sense danger nearby - a trap lurks within ${radius} tiles of this spot.`;
  return {
    data: { id: nextId(), kind: 'proximity', tile, text },
    constraint: { kind: 'atLeastOne', cells: cells.map(posKey) },
  };
}

function buildEnvironmentalClue(ctx: ClueBuildContext, tile: Position): BuiltClue | null {
  const cells = neighbors8(tile).filter((p) => isFloor(ctx, p));
  const hasTrap = cells.some((p) => ctx.trapSet.has(posKey(p)));
  if (!hasTrap) return null;
  return {
    data: {
      id: nextId(),
      kind: 'environmental',
      tile,
      text: 'The floor here is cracked and unstable. A trap must be hiding in one of the adjacent tiles.',
    },
    constraint: { kind: 'atLeastOne', cells: cells.map(posKey) },
  };
}

function buildDirectionalClue(ctx: ClueBuildContext, tile: Position, rng: SeededRandom): BuiltClue | null {
  const regions: { dir: string; test: (p: Position) => boolean }[] = [
    { dir: 'north', test: (p) => p.row < tile.row },
    { dir: 'south', test: (p) => p.row > tile.row },
    { dir: 'east', test: (p) => p.col > tile.col },
    { dir: 'west', test: (p) => p.col < tile.col },
  ];
  const valid = regions.filter((r) => {
    for (let row = 0; row < ctx.rows; row++) {
      for (let col = 0; col < ctx.cols; col++) {
        const p = { row, col };
        if (ctx.terrain[row][col] !== 'floor' || !r.test(p)) continue;
        if (ctx.trapSet.has(posKey(p))) return true;
      }
    }
    return false;
  });
  if (valid.length === 0) return null;
  const chosen = rng.pick(valid);
  const cells: Position[] = [];
  for (let row = 0; row < ctx.rows; row++) {
    for (let col = 0; col < ctx.cols; col++) {
      const p = { row, col };
      if (ctx.terrain[row][col] === 'floor' && chosen.test(p)) cells.push(p);
    }
  }
  return {
    data: {
      id: nextId(),
      kind: 'directional',
      tile,
      text: `A cold draft blows from the ${chosen.dir}. A trap lies somewhere to the ${chosen.dir} of this tile.`,
    },
    constraint: { kind: 'atLeastOne', cells: cells.map(posKey) },
  };
}

function buildSpecificClue(tile: Position, trapPos: Position): BuiltClue {
  return {
    data: {
      id: nextId(),
      kind: 'specific',
      tile,
      text: `Fresh scratch marks on the ground reveal a trap ${describeOffset(tile, trapPos)}.`,
    },
    constraint: { kind: 'specific', cell: posKey(trapPos) },
  };
}

/** Finds a true "two traps share a corridor" flavor statement, if one exists. Not fed to the solver. */
function buildConnectionClue(ctx: ClueBuildContext, tile: Position, traps: Position[], rng: SeededRandom): BuiltClue | null {
  const pairs: [Position, Position][] = [];
  for (let i = 0; i < traps.length; i++) {
    for (let j = i + 1; j < traps.length; j++) {
      const a = traps[i];
      const b = traps[j];
      if (a.row === b.row || a.col === b.col) {
        // Confirm the straight line between them is entirely open floor (a true "corridor").
        const sameRow = a.row === b.row;
        let clear = true;
        const lo = sameRow ? Math.min(a.col, b.col) : Math.min(a.row, b.row);
        const hi = sameRow ? Math.max(a.col, b.col) : Math.max(a.row, b.row);
        for (let k = lo; k <= hi; k++) {
          const p = sameRow ? { row: a.row, col: k } : { row: k, col: a.col };
          if (!isFloor(ctx, p)) {
            clear = false;
            break;
          }
        }
        if (clear) pairs.push([a, b]);
      }
    }
  }
  if (pairs.length === 0) return null;
  const [a, b] = rng.pick(pairs);
  void a;
  void b;
  return {
    data: {
      id: nextId(),
      kind: 'connection',
      tile,
      text: 'Two traps nearby appear to be laid out along the same corridor, aligned in a single row or column.',
    },
  };
}

export interface ClueGenerationResult {
  clues: ClueData[];
  solvable: boolean;
}

const CLUE_KIND_WEIGHTS: { kind: ClueKind; weight: number }[] = [
  { kind: 'numerical', weight: 5 },
  { kind: 'proximity', weight: 2 },
  { kind: 'environmental', weight: 2 },
  { kind: 'directional', weight: 1 },
];

/**
 * Builds the full clue set for a map. Grows the load-bearing clue set tile
 * by tile (in RNG order) until the solver can prove a safe route, then adds
 * a few bonus flavor clues (including "connection") for richness.
 */
export function generateClues(
  terrain: TileTerrain[][],
  rows: number,
  cols: number,
  start: Position,
  exit: Position,
  traps: Position[],
  floorKeys: string[],
  rng: SeededRandom,
  keyPos?: Position,
  doorPos?: Position,
): ClueGenerationResult {
  const ctx: ClueBuildContext = { terrain, rows, cols, trapSet: new Set(traps.map(posKey)), start, exit, keyPos, doorPos };
  const reserved = new Set<string>([posKey(start), posKey(exit), ...traps.map(posKey)]);
  if (keyPos) reserved.add(posKey(keyPos));
  if (doorPos) reserved.add(posKey(doorPos));

  // Trap placement guarantees nothing within a 1-tile radius of start is a trap
  // (see generator.ts), so those tiles are axiomatically safe - no clue needed to
  // prove it, and the solver/fallback logic can treat them as free starting ground.
  const axiomSafeTiles = neighbors8(start)
    .filter((p) => p.row >= 0 && p.row < rows && p.col >= 0 && p.col < cols && terrain[p.row][p.col] === 'floor')
    .map(posKey);

  const candidateTiles: Position[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = { row: r, col: c };
      if (terrain[r][c] === 'floor' && !reserved.has(posKey(p))) candidateTiles.push(p);
    }
  }
  const shuffled = rng.shuffle(candidateTiles);

  const built: BuiltClue[] = [];
  const clueConstraintsFor = () =>
    built
      .filter((b) => b.constraint)
      .map((b) => ({ tile: b.data.tile, constraint: b.constraint! }));
  const runValidation = () =>
    validateSolvable(terrain, start, exit, floorKeys, traps.length, clueConstraintsFor(), keyPos, doorPos, axiomSafeTiles);


  let solvableSoFar = false;
  for (const tile of shuffled) {
    const weighted = CLUE_KIND_WEIGHTS.flatMap((w) => Array(w.weight).fill(w.kind) as ClueKind[]);
    const order = rng.shuffle(weighted);
    let placed: BuiltClue | null = null;
    for (const kind of order) {
      if (kind === 'numerical') placed = buildNumericalClue(ctx, tile);
      else if (kind === 'proximity') placed = buildProximityClue(ctx, tile, rng.chance(0.5) ? 1 : 2);
      else if (kind === 'environmental') placed = buildEnvironmentalClue(ctx, tile);
      else if (kind === 'directional') placed = buildDirectionalClue(ctx, tile, rng);
      if (placed) break;
    }
    if (!placed) placed = buildNumericalClue(ctx, tile);
    if (!placed) continue;
    built.push(placed);

    if (built.length % 2 === 0 || built.length < 6) {
      const result = runValidation();
      if (result.solvable) {
        solvableSoFar = true;
        break;
      }
    }
  }

  if (!solvableSoFar) {
    const finalCheck = runValidation();
    solvableSoFar = finalCheck.solvable;
  }

  if (!solvableSoFar) {
    // Guaranteed iterative fallback: reveal one more trap per round via a specific
    // clue placed on a tile that is *already physically reachable* (proven safe and
    // connected to start) - never on a tile the player couldn't yet have walked to.
    // Revealing a trap shrinks the unknown pool, which (combined with the global
    // trap-count rule) keeps growing the reachable region until the exit is
    // provably safe, or every trap has been explicitly revealed.
    const usedTiles = new Set(built.map((b) => posKey(b.data.tile)));
    const revealedTrapCells = new Set(
      built.filter((b) => b.constraint?.kind === 'specific').map((b) => (b.constraint as { cell: string }).cell),
    );
    let guard = traps.length + 2;
    while (!solvableSoFar && guard-- > 0) {
      const result = runValidation();
      if (result.solvable) {
        solvableSoFar = true;
        break;
      }
      const nextTrap = traps.find((t) => !revealedTrapCells.has(posKey(t)));
      if (!nextTrap) break; // every trap already revealed but still unsolvable: should not happen for a valid map
      const neighborFallback = neighbors4(start).find(
        (p) => isFloor(ctx, p) && !usedTiles.has(posKey(p)) && posKey(p) !== posKey(exit),
      );
      // Prefer a brand-new, never-used reachable tile; if every reachable tile already
      // holds a clue, stack onto one of them (never silently reuse the undiscoverable
      // start tile itself - the player never "moves onto" their own starting square).
      const freshReachable = Array.from(result.reachableSafe)
        .filter((k) => !usedTiles.has(k) && k !== posKey(exit) && k !== posKey(start))
        .map((k) => ({ row: Number(k.split(',')[0]), col: Number(k.split(',')[1]) }))[0];
      const anyReachable = Array.from(result.reachableSafe)
        .filter((k) => k !== posKey(exit) && k !== posKey(start))
        .map((k) => ({ row: Number(k.split(',')[0]), col: Number(k.split(',')[1]) }))[0];
      const host = freshReachable ?? neighborFallback ?? anyReachable ?? start;
      usedTiles.add(posKey(host));
      revealedTrapCells.add(posKey(nextTrap));
      built.push(buildSpecificClue(host, nextTrap));
    }
    const finalCheck = runValidation();
    solvableSoFar = finalCheck.solvable;
  }

  // Mark load-bearing clues based on the final solver run.
  const finalResult = runValidation();
  const clueList: ClueData[] = built.map((b, idx) => ({
    ...b.data,
    loadBearing: finalResult.usedConstraintIndices.has(idx),
  }));

  // Bonus flavor clues: connection statements, placed on leftover floor tiles.
  const usedTileKeys = new Set(built.map((b) => posKey(b.data.tile)));
  const leftover = shuffled.filter((t) => !usedTileKeys.has(posKey(t)));
  const bonusTarget = Math.min(leftover.length, 2);
  let bonusPlaced = 0;
  for (const tile of leftover) {
    if (bonusPlaced >= bonusTarget) break;
    const conn = buildConnectionClue(ctx, tile, traps, rng);
    if (conn) {
      clueList.push({ ...conn.data, loadBearing: false });
      bonusPlaced++;
    }
  }

  return { clues: clueList, solvable: solvableSoFar };
}
