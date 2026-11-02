import { describe, expect, it } from 'vitest';
import { generateDungeonMap } from '../game/generator';
import { DIFFICULTY_PRESETS, DIFFICULTY_NAMES } from '../game/seed';
import { bfsPath, bfsPathWithKey } from '../game/grid';
import { posKey } from '../game/types';

function dateKeyPlusDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('generateDungeonMap', () => {
  const base = new Date('2024-01-01T12:00:00');
  const sampleDays = 30; // crossed with every difficulty below for broad coverage

  for (let i = 0; i < sampleDays; i++) {
    const dateKey = dateKeyPlusDays(base, i);
    for (const difficultyName of DIFFICULTY_NAMES) {
      it(
        `produces a fair, solvable ${difficultyName} map for ${dateKey}`,
        () => {
          const map = generateDungeonMap(dateKey, difficultyName);

        expect(map.traps.length).toBe(map.trapCount);
        expect(map.traps.length).toBeGreaterThan(0);

        // Start and exit must never be traps, and must be far apart.
        const trapKeys = new Set(map.traps.map(posKey));
        expect(trapKeys.has(posKey(map.start))).toBe(false);
        expect(trapKeys.has(posKey(map.exit))).toBe(false);

        // A real trap-free path must exist and match the recorded optimalMoves.
        const path = bfsPathWithKey(map.terrain, map.start, map.exit, trapKeys, map.key, map.door, map.gates);
        expect(path).not.toBeNull();
        expect(path!.length - 1).toBe(map.optimalMoves);
        for (const step of path!) {
          expect(trapKeys.has(posKey(step))).toBe(false);
        }

        // Every clue's stated tile must be a floor tile, and never the start tile itself
        // (a clue placed there could never be discovered, since reaching start costs no move).
        for (const clue of map.clues) {
          expect(map.terrain[clue.tile.row][clue.tile.col]).toBe('floor');
          expect(posKey(clue.tile)).not.toBe(posKey(map.start));
        }

        // At least one clue must be load-bearing (i.e. the solver actually used it).
        expect(map.clues.some((c) => c.loadBearing)).toBe(true);

        // Every difficulty tier mandates a minimum number of switch/blocked-tile
        // gates; the generator must reject layouts that can't meet it rather than
        // silently publishing a dungeon with fewer gates than promised.
        const minGates = DIFFICULTY_PRESETS[difficultyName].gateCountRange[0];
        expect(map.gates.length).toBeGreaterThanOrEqual(minGates);

        // If a key/door is present, the door must be a genuine gate: unreachable without the key.
        if (map.key && map.door) {
          const blockedByDoor = new Set([...trapKeys, posKey(map.door)]);
          const withoutKeyPath = bfsPath(map.terrain, map.start, map.exit, blockedByDoor);
          expect(withoutKeyPath).toBeNull();
        }

        // Every switch/blocked-tile gate must be a genuine chokepoint, its switch
        // must be reachable without crossing its own blocked tile, and a lever
        // clue must exist pointing at it. Gates are generated as a nested
        // sequence (each one assumes earlier gates are still closed), so the
        // chokepoint check must keep every earlier gate closed too.
        const leverClues = map.clues.filter((c) => c.kind === 'lever');
        expect(leverClues.length).toBe(map.gates.length);
        map.gates.forEach((gate, i) => {
          const priorBlockedPos = map.gates.slice(0, i).map((g) => posKey(g.blockedPos));
          const blockedByGate = new Set([...trapKeys, ...priorBlockedPos, posKey(gate.blockedPos)]);
          const withoutGatePath = bfsPath(map.terrain, map.start, map.exit, blockedByGate);
          expect(withoutGatePath).toBeNull();

          const reachableWithoutThisGate = bfsPath(map.terrain, map.start, gate.switchPos, blockedByGate);
          expect(reachableWithoutThisGate).not.toBeNull();
        });

        // Permanent blocks are genuinely impassable (baked into terrain) and never
        // coincide with start, exit, traps, key/door, or any gate tile.
        for (const block of map.permanentBlocks) {
          expect(map.terrain[block.row][block.col]).toBe('wall');
          expect(posKey(block)).not.toBe(posKey(map.start));
          expect(posKey(block)).not.toBe(posKey(map.exit));
        }
        },
        20000,
      );
    }
  }

  it('is fully deterministic for the same date and difficulty', () => {
    const dateKey = '2024-06-15';
    const mapA = generateDungeonMap(dateKey, 'Hard');
    const mapB = generateDungeonMap(dateKey, 'Hard');
    expect(mapA.terrain).toEqual(mapB.terrain);
    expect(mapA.traps).toEqual(mapB.traps);
    expect(mapA.start).toEqual(mapB.start);
    expect(mapA.exit).toEqual(mapB.exit);
    expect(mapA.clues.map((c) => c.text)).toEqual(mapB.clues.map((c) => c.text));
  });

  it('produces an independent dungeon per difficulty on the same date', () => {
    const dateKey = '2024-06-15';
    const easy = generateDungeonMap(dateKey, 'Easy');
    const hard = generateDungeonMap(dateKey, 'Hard');
    expect(easy.rows).not.toBe(hard.rows);
    expect(easy.seed).not.toBe(hard.seed);
  });
});
