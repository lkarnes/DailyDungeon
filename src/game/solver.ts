/**
 * The logical-deduction engine.
 *
 * This module proves (or disproves) that a dungeon map's *discoverable*
 * clues contain enough information for a perfectly careful player to find a
 * safe route from start to exit WITHOUT ever stepping on a tile whose safety
 * hasn't been logically established. It never peeks at the hidden trap set
 * except to answer "is this clue's stated fact true" when the map is first
 * built - the actual proof search below only uses clue constraints plus the
 * global trap count, exactly like a human solver would.
 *
 * Supported hard constraints (fed into the CSP solver):
 *  - exact:      "exactly K traps among this set of cells" (numerical clues)
 *  - atLeastOne: "at least one trap among this set of cells" (proximity,
 *                environmental, directional clues)
 *  - specific:   "this exact cell is a trap" (specific clues)
 *
 * "Connection" clues are true, human-readable flavor statements derived from
 * the real trap placement, but are intentionally not fed into the automated
 * solver (see clues.ts for details) - they help a human reason, but the
 * generator never *relies* on them to prove solvability.
 */
import type { Gate, Position, TileTerrain } from './types';
import { posKey } from './types';
import { bfsPathWithKey, inBounds } from './grid';

export interface ExactConstraint {
  kind: 'exact';
  cells: string[];
  count: number;
}
export interface AtLeastOneConstraint {
  kind: 'atLeastOne';
  cells: string[];
}
export interface SpecificConstraint {
  kind: 'specific';
  cell: string;
}
export type Constraint = ExactConstraint | AtLeastOneConstraint | SpecificConstraint;

interface DeduceResult {
  safe: Set<string>;
  trap: Set<string>;
}

const COMPONENT_SIZE_CAP = 22;

/**
 * Runs constraint propagation + bounded CSP backtracking to a fixpoint.
 * `floorKeys` is the universe of all non-wall tiles that could hold a trap
 * (excludes start/exit/key/door, which are guaranteed safe by construction).
 */
export function deduce(floorKeys: string[], totalTraps: number, constraints: Constraint[], initiallySafe: string[]): DeduceResult {
  const safe = new Set(initiallySafe);
  const trap = new Set<string>();

  for (const c of constraints) {
    if (c.kind === 'specific') trap.add(c.cell);
  }

  let changed = true;
  while (changed) {
    changed = false;

    // 1. Direct propagation for exact / atLeastOne constraints.
    for (const c of constraints) {
      if (c.kind === 'exact') {
        const unknown = c.cells.filter((x) => !safe.has(x) && !trap.has(x));
        const knownTrapsIn = c.cells.filter((x) => trap.has(x)).length;
        const remaining = c.count - knownTrapsIn;
        if (remaining < 0 || remaining > unknown.length) continue;
        if (remaining === 0 && unknown.length > 0) {
          for (const u of unknown) if (!safe.has(u)) { safe.add(u); changed = true; }
        } else if (remaining === unknown.length && unknown.length > 0) {
          for (const u of unknown) if (!trap.has(u)) { trap.add(u); changed = true; }
        }
      } else if (c.kind === 'atLeastOne') {
        const hasKnownTrap = c.cells.some((x) => trap.has(x));
        if (!hasKnownTrap) {
          const unknown = c.cells.filter((x) => !safe.has(x));
          if (unknown.length === 1 && !trap.has(unknown[0])) {
            trap.add(unknown[0]);
            changed = true;
          }
        }
      }
    }

    // 2. Subset rule between pairs of exact constraints.
    const exactCs = constraints.filter((c): c is ExactConstraint => c.kind === 'exact');
    for (const A of exactCs) {
      for (const B of exactCs) {
        if (A === B) continue;
        const aUnknown = A.cells.filter((x) => !safe.has(x) && !trap.has(x));
        const bUnknown = new Set(B.cells.filter((x) => !safe.has(x) && !trap.has(x)));
        if (aUnknown.length === 0 || aUnknown.length >= bUnknown.size) continue;
        if (!aUnknown.every((x) => bUnknown.has(x))) continue;
        const aKnownTrap = A.cells.filter((x) => trap.has(x)).length;
        const bKnownTrap = B.cells.filter((x) => trap.has(x)).length;
        const aRemain = A.count - aKnownTrap;
        const bRemain = B.count - bKnownTrap;
        const diff = [...bUnknown].filter((x) => !aUnknown.includes(x));
        const diffCount = bRemain - aRemain;
        if (diffCount === 0 && diff.length > 0) {
          for (const d of diff) if (!safe.has(d)) { safe.add(d); changed = true; }
        } else if (diffCount === diff.length && diff.length > 0) {
          for (const d of diff) if (!trap.has(d)) { trap.add(d); changed = true; }
        }
      }
    }

    // 3. Global trap-count endgame rule.
    const remainingTrapsGlobal = totalTraps - trap.size;
    const allUnknown = floorKeys.filter((k) => !safe.has(k) && !trap.has(k));
    if (remainingTrapsGlobal <= 0 && allUnknown.length > 0) {
      for (const u of allUnknown) safe.add(u);
      changed = true;
    } else if (remainingTrapsGlobal === allUnknown.length && allUnknown.length > 0) {
      for (const u of allUnknown) trap.add(u);
      changed = true;
    }

    // 4. Bounded CSP backtracking over connected constraint components.
    if (!changed) {
      changed = resolveComponents(floorKeys, totalTraps, constraints, safe, trap);
    }
  }

  return { safe, trap };
}

function resolveComponents(
  floorKeys: string[],
  totalTraps: number,
  constraints: Constraint[],
  safe: Set<string>,
  trap: Set<string>,
): boolean {
  // Build union-find over unknown cells that co-occur in some constraint.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const relevant: { c: Constraint; unknownCells: string[] }[] = [];
  for (const c of constraints) {
    if (c.kind === 'specific') continue;
    const unknownCells = c.cells.filter((x) => !safe.has(x) && !trap.has(x));
    if (unknownCells.length === 0) continue;
    relevant.push({ c, unknownCells });
    for (let i = 1; i < unknownCells.length; i++) union(unknownCells[0], unknownCells[i]);
    find(unknownCells[0]);
  }

  const componentsByRoot = new Map<string, Set<string>>();
  for (const key of parent.keys()) {
    const root = find(key);
    if (!componentsByRoot.has(root)) componentsByRoot.set(root, new Set());
    componentsByRoot.get(root)!.add(key);
  }

  const allUnknown = floorKeys.filter((k) => !safe.has(k) && !trap.has(k));
  const inAnyComponent = new Set<string>();
  componentsByRoot.forEach((set) => set.forEach((k) => inAnyComponent.add(k)));
  const freeCellCount = allUnknown.filter((k) => !inAnyComponent.has(k)).length;
  const remainingTrapsGlobal = totalTraps - trap.size;

  let anyChange = false;
  for (const [root, cellSet] of componentsByRoot) {
    void root;
    const cells = Array.from(cellSet);
    if (cells.length > COMPONENT_SIZE_CAP) continue; // too large to brute force; skip (other rules may still help)
    const localConstraints = relevant
      .filter((r) => r.unknownCells.every((c) => cellSet.has(c)))
      .map((r) => ({ kind: r.c.kind, indices: r.unknownCells.map((c) => cells.indexOf(c)), count: r.c.kind === 'exact' ? r.c.count : 0 }));

    const minTrapsInComponent = Math.max(0, remainingTrapsGlobal - freeCellCount);
    const maxTrapsInComponent = Math.min(cells.length, remainingTrapsGlobal);
    if (minTrapsInComponent > maxTrapsInComponent) continue; // inconsistent, skip

    const verdicts = solveComponentCsp(cells.length, localConstraints, minTrapsInComponent, maxTrapsInComponent);
    if (!verdicts) continue;
    for (let i = 0; i < cells.length; i++) {
      if (verdicts.alwaysSafe[i] && !safe.has(cells[i])) {
        safe.add(cells[i]);
        anyChange = true;
      } else if (verdicts.alwaysTrap[i] && !trap.has(cells[i])) {
        trap.add(cells[i]);
        anyChange = true;
      }
    }
  }
  return anyChange;
}

function solveComponentCsp(
  n: number,
  constraints: { kind: Constraint['kind']; indices: number[]; count: number }[],
  minTraps: number,
  maxTraps: number,
): { alwaysSafe: boolean[]; alwaysTrap: boolean[] } | null {
  const alwaysSafe = new Array(n).fill(true);
  const alwaysTrap = new Array(n).fill(true);
  const assignment: boolean[] = new Array(n).fill(false);
  let foundAny = false;

  // Pre-index constraints by their max index so we only check them once fully assigned.
  const byMaxIndex: Map<number, typeof constraints> = new Map();
  for (const c of constraints) {
    const maxIdx = c.indices.length ? Math.max(...c.indices) : -1;
    if (!byMaxIndex.has(maxIdx)) byMaxIndex.set(maxIdx, []);
    byMaxIndex.get(maxIdx)!.push(c);
  }

  function trapsSoFar(upTo: number): number {
    let count = 0;
    for (let i = 0; i < upTo; i++) if (assignment[i]) count++;
    return count;
  }

  function checkAt(idx: number): boolean {
    const toCheck = byMaxIndex.get(idx);
    if (!toCheck) return true;
    for (const c of toCheck) {
      const cnt = c.indices.filter((i) => assignment[i]).length;
      if (c.kind === 'exact' && cnt !== c.count) return false;
      if (c.kind === 'atLeastOne' && cnt < 1) return false;
    }
    return true;
  }

  function backtrack(idx: number): void {
    if (idx === n) {
      const total = trapsSoFar(n);
      if (total < minTraps || total > maxTraps) return;
      foundAny = true;
      for (let i = 0; i < n; i++) {
        if (assignment[i]) alwaysSafe[i] = false;
        else alwaysTrap[i] = false;
      }
      return;
    }
    // Prune: even if all remaining become traps, can we still reach minTraps? Even if all become safe, can we stay <= maxTraps?
    const remaining = n - idx;
    const soFar = trapsSoFar(idx);
    if (soFar + remaining < minTraps) return;
    if (soFar > maxTraps) return;

    assignment[idx] = false;
    if (checkAt(idx)) backtrack(idx + 1);
    assignment[idx] = true;
    if (checkAt(idx)) backtrack(idx + 1);
    assignment[idx] = false;
  }
  backtrack(0);
  if (!foundAny) return null;
  return { alwaysSafe, alwaysTrap };
}

export interface SolvabilityResult {
  solvable: boolean;
  provenSafe: Set<string>;
  provenTrap: Set<string>;
  usedConstraintIndices: Set<number>;
  /** Tiles physically reachable from start by walking only on tiles already proven safe. */
  reachableSafe: Set<string>;
}

/**
 * Simulates a perfectly careful player: clues can only be "read" once their
 * tile is part of the currently-proven-safe region connected to start.
 * Repeats discovery -> deduction -> connectivity until no more progress is
 * made. Returns whether the exit ends up connected to start through
 * proven-safe tiles only, plus which constraints actually contributed
 * (so non-load-bearing flavor clues can be labeled as such).
 */
export function validateSolvable(
  terrain: TileTerrain[][],
  start: Position,
  exit: Position,
  floorKeys: string[],
  totalTraps: number,
  clueConstraints: { tile: Position; constraint: Constraint }[],
  keyPos?: Position,
  doorPos?: Position,
  axiomSafeTiles: string[] = [],
  gates: Gate[] = [],
): SolvabilityResult {
  const startKey = posKey(start);
  const activeIdx = new Set<number>();
  let connectedSafe = new Set<string>([startKey, ...axiomSafeTiles]);
  if (keyPos) connectedSafe.add(posKey(keyPos));
  // Switch tiles are never traps (guaranteed by construction, like the key tile),
  // so they're inherently safe - the only thing still to prove is reachability.
  for (const g of gates) connectedSafe.add(posKey(g.switchPos));

  const computeConnected = (safeSet: Set<string>): Set<string> => {
    const rows = terrain.length;
    const cols = terrain[0].length;
    const plainBfs = (unlockedMask: number, hasKeyAccess: boolean): Set<string> => {
      const visited = new Set<string>([startKey]);
      const queue: Position[] = [start];
      let qi = 0;
      while (qi < queue.length) {
        const cur = queue[qi++];
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const np = { row: cur.row + dr, col: cur.col + dc };
          if (!inBounds(rows, cols, np) || terrain[np.row][np.col] === 'wall') continue;
          const nk = posKey(np);
          if (visited.has(nk)) continue;
          if (!safeSet.has(nk)) continue;
          if (doorPos && nk === posKey(doorPos) && !hasKeyAccess) continue;
          const gateIdx = gates.findIndex((g) => posKey(g.blockedPos) === nk);
          if (gateIdx !== -1 && !(unlockedMask & (1 << gateIdx))) continue;
          visited.add(nk);
          queue.push(np);
        }
      }
      return visited;
    };

    // Nested fixpoint: a gate only opens once its switch tile has been reached,
    // which may itself require another gate to have opened first. Re-running the
    // plain BFS and re-checking which switches are now visited converges in at
    // most gates.length + 1 passes (each pass either unlocks >=1 new gate or stops).
    let unlockedMask = 0;
    let hasKeyAccess = !doorPos || !keyPos || safeSet.has(posKey(keyPos));
    let visited = plainBfs(unlockedMask, hasKeyAccess);
    for (let iter = 0; iter < gates.length + 1; iter++) {
      let nextMask = unlockedMask;
      gates.forEach((g, i) => {
        if (visited.has(posKey(g.switchPos))) nextMask |= 1 << i;
      });
      const nextHasKeyAccess = hasKeyAccess || (!!keyPos && visited.has(posKey(keyPos)));
      if (nextMask === unlockedMask && nextHasKeyAccess === hasKeyAccess) break;
      unlockedMask = nextMask;
      hasKeyAccess = nextHasKeyAccess;
      visited = plainBfs(unlockedMask, hasKeyAccess);
    }
    return visited;
  };

  connectedSafe = computeConnected(connectedSafe);

  let iterations = 0;
  while (iterations++ < 50) {
    const discovered: Constraint[] = [];
    clueConstraints.forEach((cc, idx) => {
      if (connectedSafe.has(posKey(cc.tile))) {
        discovered.push(cc.constraint);
        activeIdx.add(idx);
      }
    });

    const { safe, trap } = deduce(floorKeys, totalTraps, discovered, Array.from(connectedSafe));
    const nextConnected = computeConnected(safe);

    const grew = nextConnected.size > connectedSafe.size;
    connectedSafe = nextConnected;

    if (connectedSafe.has(posKey(exit))) {
      return { solvable: true, provenSafe: safe, provenTrap: trap, usedConstraintIndices: activeIdx, reachableSafe: connectedSafe };
    }
    if (!grew) {
      // Check if adding newly discoverable clues (now that safe set grew) changes anything next loop; if not, stuck.
      const moreToDiscover = clueConstraints.some((cc, idx) => connectedSafe.has(posKey(cc.tile)) && !activeIdx.has(idx));
      if (!moreToDiscover) {
        return { solvable: false, provenSafe: safe, provenTrap: trap, usedConstraintIndices: activeIdx, reachableSafe: connectedSafe };
      }
    }
  }
  return { solvable: false, provenSafe: connectedSafe, provenTrap: new Set(), usedConstraintIndices: activeIdx, reachableSafe: connectedSafe };
}

/** Thin wrapper re-exported for callers that only need shortest-path logic alongside the solver. */
export function shortestSafePath(
  terrain: TileTerrain[][],
  start: Position,
  exit: Position,
  blocked: Set<string>,
  keyPos?: Position,
  doorPos?: Position,
  gates: Gate[] = [],
): Position[] | null {
  return bfsPathWithKey(terrain, start, exit, blocked, keyPos, doorPos, gates);
}
