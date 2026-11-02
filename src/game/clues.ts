/**
 * Clue generation: builds human-readable clues whose factual payload is
 * always true for the given map, and incrementally feeds the load-bearing
 * ones (numerical, specific, proximity, environmental, directional) into the
 * solver until it can prove a safe route exists. "Connection" clues are
 * flavor-only (see solver.ts header comment). Lever clues point at hidden
 * switches (see generator.ts) and carry no trap constraint at all.
 */
import type { ClueData, ClueKind, Gate, Position, TileTerrain } from './types';
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

/** Fills a `{count}`/`{offset}`/`{dir}`/`{radius}` style template with the given values. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

function pick(rng: SeededRandom, templates: string[]): string {
  return rng.pick(templates);
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

// --- Riddle-style text variants -------------------------------------------------
// Multiple phrasings per clue kind keep the dungeon feeling varied and a little
// cryptic, without changing the underlying logical constraint the solver relies on.

const NUMERICAL_ZERO_TEMPLATES = [
  'You study the surrounding floor carefully: none of the 8 tiles around this spot hide a trap.',
  'An old rhyme echoes here: "Eight stones encircle me, yet not one holds decay." This ring is clean.',
  'The dust around this spot lies undisturbed in all eight directions - nothing lurks nearby.',
  'A faint hum of safety surrounds this tile; the eight stones around it are all sound.',
];

const NUMERICAL_TEMPLATES = [
  'There {is_are} exactly {count} trap{s} among the 8 tiles surrounding this spot.',
  'Count the shadows: {count} trap{s} lie hiding in the ring of stones around you.',
  'A weathered carving reads: "Eight stones encircle me, and {count} of them conceal death."',
  'You sense {count} pulse{s} of danger emanating from the tiles that surround this one.',
  'A trembling compass needle suggests {count} nearby hazard{s} among the adjacent eight.',
];

const SPECIFIC_TEMPLATES = [
  'Fresh scratch marks on the ground reveal a trap {offset}.',
  'A skeletal hand, long still, points {offset} - a trap awaits there.',
  'Carved roughly into the wall: "Beware the stones {offset}."',
  'The dust is disturbed in a telling pattern - something deadly rests {offset}.',
  'An old journal page, half-buried, is annotated: trap located {offset}.',
];

const PROXIMITY_TEMPLATES_R1 = [
  'A trap is hidden somewhere within 1 tile of this spot. Tread carefully.',
  'The air feels wrong here - danger is adjacent, within a single step.',
  'A low growl seems to come from right next to this tile.',
];

const PROXIMITY_TEMPLATES_R2 = [
  'You sense danger nearby - a trap lurks within {radius} tiles of this spot.',
  'A chill runs down your spine - something dangerous hides within {radius} paces.',
  'An old rhyme warns: "Within {radius} steps, a trap doth hide."',
  'Your torch flickers unnaturally - trouble is within {radius} tiles of here.',
];

const ENVIRONMENTAL_TEMPLATES = [
  'The floor here is cracked and unstable. A trap must be hiding in one of the adjacent tiles.',
  'Dust sifts quietly from the ceiling here - the stones nearby cannot be trusted.',
  'A faint smell of decay surrounds this tile; danger is adjacent.',
  'Cobwebs here are oddly undisturbed, as if something avoids walking nearby.',
];

const DIRECTIONAL_TEMPLATES = [
  'A cold draft blows from the {dir}. A trap lies somewhere to the {dir} of this tile.',
  'Birds and vermin flee to the {dir} whenever they near here - a trap must lie that way.',
  'A half-buried sign points {dir}: "Danger lies beyond."',
  'Your compass needle trembles toward the {dir} - something hazardous lies that direction.',
];

const CONNECTION_TEMPLATES = [
  'Two traps nearby appear to be laid out along the same corridor, aligned in a single row or column.',
  'A faint rune suggests two hidden perils share the same straight path.',
  'An old map fragment hints that a pair of dangers lines up along one corridor.',
];

const LEVER_TEMPLATES = [
  'A weathered note mentions a hidden lever {offset}.',
  'Something metallic glints faintly {offset} - perhaps a mechanism?',
  'An old diagram shows a lever {offset} that might clear a blocked path.',
  'Scratched into the stone: "Pull the lever {offset} to clear the way."',
];

function buildNumericalClue(ctx: ClueBuildContext, tile: Position, rng: SeededRandom): BuiltClue | null {
  const cells = neighbors8(tile).filter((p) => isFloor(ctx, p));
  if (cells.length === 0) return null;
  const count = cells.filter((p) => ctx.trapSet.has(posKey(p))).length;
  const text =
    count === 0
      ? pick(rng, NUMERICAL_ZERO_TEMPLATES)
      : fill(pick(rng, NUMERICAL_TEMPLATES), { count: String(count), is_are: count === 1 ? 'is' : 'are', s: count === 1 ? '' : 's' });
  return {
    data: { id: nextId(), kind: 'numerical', tile, text },
    constraint: { kind: 'exact', cells: cells.map(posKey), count },
  };
}

function buildProximityClue(ctx: ClueBuildContext, tile: Position, radius: number, rng: SeededRandom): BuiltClue | null {
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
  const text = radius === 1 ? pick(rng, PROXIMITY_TEMPLATES_R1) : fill(pick(rng, PROXIMITY_TEMPLATES_R2), { radius: String(radius) });
  return {
    data: { id: nextId(), kind: 'proximity', tile, text },
    constraint: { kind: 'atLeastOne', cells: cells.map(posKey) },
  };
}

function buildEnvironmentalClue(ctx: ClueBuildContext, tile: Position, rng: SeededRandom): BuiltClue | null {
  const cells = neighbors8(tile).filter((p) => isFloor(ctx, p));
  const hasTrap = cells.some((p) => ctx.trapSet.has(posKey(p)));
  if (!hasTrap) return null;
  return {
    data: { id: nextId(), kind: 'environmental', tile, text: pick(rng, ENVIRONMENTAL_TEMPLATES) },
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
    data: { id: nextId(), kind: 'directional', tile, text: fill(pick(rng, DIRECTIONAL_TEMPLATES), { dir: chosen.dir }) },
    constraint: { kind: 'atLeastOne', cells: cells.map(posKey) },
  };
}

function buildSpecificClue(tile: Position, trapPos: Position, rng: SeededRandom): BuiltClue {
  return {
    data: { id: nextId(), kind: 'specific', tile, text: fill(pick(rng, SPECIFIC_TEMPLATES), { offset: describeOffset(tile, trapPos) }) },
    constraint: { kind: 'specific', cell: posKey(trapPos) },
  };
}

/** A guaranteed hint pointing at a hidden switch's exact location. Never fed to the trap solver. */
function buildLeverClue(tile: Position, switchPos: Position, rng: SeededRandom): BuiltClue {
  return {
    data: { id: nextId(), kind: 'lever', tile, text: fill(pick(rng, LEVER_TEMPLATES), { offset: describeOffset(tile, switchPos) }) },
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
  rng.pick(pairs); // consumed only to confirm a true pair exists; the clue itself stays general
  return {
    data: { id: nextId(), kind: 'connection', tile, text: pick(rng, CONNECTION_TEMPLATES) },
  };
}

export interface ClueGenerationResult {
  clues: ClueData[];
  solvable: boolean;
}

export interface GateInfo {
  gate: Gate;
  clueHostPos: Position;
}

const CLUE_KIND_WEIGHTS: { kind: ClueKind; weight: number }[] = [
  { kind: 'numerical', weight: 5 },
  { kind: 'proximity', weight: 2 },
  { kind: 'environmental', weight: 2 },
  { kind: 'directional', weight: 1 },
];


/**
 * Builds the full clue set for a map. Grows the load-bearing clue set tile
 * by tile (in RNG order, capped to keep the hint density reasonable) until
 * the solver can prove a safe route, falling back to a minimal set of
 * guaranteed reveals if the cap isn't enough. Always adds one guaranteed
 * lever clue per gate, plus a couple of bonus flavor clues for richness.
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
  gateInfos: GateInfo[] = [],
): ClueGenerationResult {
  const ctx: ClueBuildContext = { terrain, rows, cols, trapSet: new Set(traps.map(posKey)), start, exit, keyPos, doorPos };
  const gates = gateInfos.map((g) => g.gate);
  const reserved = new Set<string>([posKey(start), posKey(exit), ...traps.map(posKey)]);
  if (keyPos) reserved.add(posKey(keyPos));
  if (doorPos) reserved.add(posKey(doorPos));
  for (const { gate, clueHostPos } of gateInfos) {
    reserved.add(posKey(gate.switchPos));
    reserved.add(posKey(gate.blockedPos));
    reserved.add(posKey(clueHostPos));
  }

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
    validateSolvable(terrain, start, exit, floorKeys, traps.length, clueConstraintsFor(), keyPos, doorPos, axiomSafeTiles, gates);

  // Cap the main "cover the map in numbers" sweep so hint density stays
  // reasonable; anything still unsolved beyond this falls through to the
  // efficient, guaranteed, reachability-aware fallback below (which adds the
  // minimum number of specific reveals needed, not a clue on every tile).
  const mainSweepCap = Math.min(shuffled.length, Math.max(traps.length * 2, 8));

  let solvableSoFar = false;
  for (const tile of shuffled.slice(0, mainSweepCap)) {
    const weighted = CLUE_KIND_WEIGHTS.flatMap((w) => Array(w.weight).fill(w.kind) as ClueKind[]);
    const order = rng.shuffle(weighted);
    let placed: BuiltClue | null = null;
    for (const kind of order) {
      if (kind === 'numerical') placed = buildNumericalClue(ctx, tile, rng);
      else if (kind === 'proximity') placed = buildProximityClue(ctx, tile, rng.chance(0.5) ? 1 : 2, rng);
      else if (kind === 'environmental') placed = buildEnvironmentalClue(ctx, tile, rng);
      else if (kind === 'directional') placed = buildDirectionalClue(ctx, tile, rng);
      if (placed) break;
    }
    if (!placed) placed = buildNumericalClue(ctx, tile, rng);
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
      built.push(buildSpecificClue(host, nextTrap, rng));
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

  // Guaranteed lever clue per gate: always placed, since it carries no CSP
  // constraint and the host tile was already reserved as reachable before its
  // own gate (see generator.ts).
  for (const { gate, clueHostPos } of gateInfos) {
    const lever = buildLeverClue(clueHostPos, gate.switchPos, rng);
    clueList.push({ ...lever.data, loadBearing: true });
  }

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
