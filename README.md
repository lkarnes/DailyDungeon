# Daily Dungeon

**Daily Dungeon** is a daily, browser-based escape puzzle. Every day everyone gets the exact same
procedurally generated dungeon (seeded from the calendar date), and the goal is to reach the exit
without triggering a hidden trap - using as few moves as possible. There is no time pressure, no
platforming, and no blind guessing: every trap can be logically deduced from the clues scattered
around the map, and the generator mathematically proves a safe route exists before a dungeon is
ever published.

Think *Wordle* meets *Minesweeper*, played on a hand-of-cards-sized dungeon map.

## Play it

```powershell
npm install
npm run dev
```

Then open the printed `http://localhost:5173` URL. A production build is created with `npm run build`
and previewed with `npm run preview`.

## Gameplay loop

1. **Start the daily challenge** - the dungeon for today is generated once (deterministically) from
   today's date and cached for the session.
2. **Explore** - move with the arrow keys, `WASD`, the on-screen arrow buttons, or by clicking an
   adjacent tile. Moving costs one "move"; nothing else does.
3. **Uncover clues** - walking onto a clue tile automatically reveals it and adds it to your Clue
   Log (free to re-read at any time).
4. **Deduce safe tiles** - combine clues to work out which tiles must be safe and which must hide a
   trap, the same way you would reason through a Minesweeper board.
5. **Reach the exit** - in as few moves as possible, without ever stepping on a trap.
6. **See your score** - moves used vs. the mathematically optimal route, clues discovered, hints
   used, and a final score, plus your streak and lifetime stats.

Free, no-move-cost tools:
- 🚩 **Mark Trap** - flag a tile you suspect is dangerous, purely for your own bookkeeping.
- 🔦 **Scan** - (costs points and forfeits the "no hints" bonus) reveals whether one specific tile is
  a trap, limited to 3 uses per run.

Triggering a trap ends that day's run. Daily Dungeon is a one-attempt-per-day game (like Wordle) -
your result is saved locally and shown again if you reload the page. **Practice Mode** generates an
extra, non-deterministic dungeon you can retry as often as you like without touching your daily
stats or streak.

## Clue types

| Type | Example | Used by the solver to *prove* safety? |
| --- | --- | --- |
| 🔢 Numerical | "Exactly 2 traps among the 8 tiles surrounding this spot." | Yes |
| 🎯 Specific | "A trap is 2 tiles north, 1 tile east of here." | Yes |
| 📍 Proximity | "A trap is within 2 tiles of this spot." | Yes |
| 🪨 Environmental | "The floor here is cracked - a trap is adjacent." | Yes |
| 🧭 Directional | "A trap lies somewhere north of this tile." | Yes |
| 🔗 Connection | "Two traps are aligned along the same row/column." | No - flavor/human reasoning aid only |

## Scoring

| Event | Points |
| --- | --- |
| Escape the dungeon | +1000 |
| Each move | -10 |
| Each clue discovered | +25 |
| Each hidden treasure found | +50 |
| Complete without using a scan | +100 |
| Each scan used | -50 |

The results screen also shows your move count next to the dungeon's mathematically optimal (shortest
possible, trap-free) route, so you can see exactly how efficient your run was.

## Daily generation & fairness guarantee

Everything is derived from a single seed string built from the player's local calendar date
(`daily-dungeon-v1-YYYY-MM-DD`), fed through a deterministic PRNG (`cyrb128` + `sfc32`). The same
date always produces the exact same dungeon for every player, with no server required.

Generation pipeline (see [`src/game/`](./src/game)):

1. **Cave layout** - a cellular-automaton cave is carved out of the grid, and only the largest
   connected floor region is kept ([`grid.ts`](./src/game/grid.ts)).
2. **Start & exit** - placed via double-BFS to maximize the distance between them.
3. **Traps & items** - traps are scattered with light spacing; an optional key/door pair is placed at
   a genuine graph *articulation point* (a provable chokepoint, found via cut-vertex detection) so the
   gate is never just decorative; collectibles are sprinkled on leftover floor tiles
   ([`generator.ts`](./src/game/generator.ts)).
4. **Clues** - built up tile by tile until a logical-deduction solver can prove a safe path exists
   ([`clues.ts`](./src/game/clues.ts)).
5. **Validation** - a constraint-propagation + bounded CSP solver
   ([`solver.ts`](./src/game/solver.ts)) simulates a perfectly careful player: a clue can only be
   "read" once its tile is part of the region already *proven* safe and connected to the start. The
   generator only publishes a dungeon once this solver confirms the exit becomes provably reachable
   without ever requiring a blind guess. If a candidate map can't be proven solvable, the generator
   retries with a new seed variant (deterministically, so the result is still always the same for
   everyone on a given day).

This is the same core idea as a Minesweeper solver: numerical/specific/proximity/environmental/
directional clues become hard constraints (`exact`, `atLeastOne`, `specific`), combined with the
globally known trap count, and propagated to a fixpoint, falling back to bounded backtracking search
over small connected constraint components. "Connection" clues are included for flavor and genuine
human-usable information but are intentionally not relied upon by the automated proof.

Automated tests ([`src/game/generator.test.ts`](./src/game/generator.test.ts)) regenerate dungeons
for 70 consecutive days and assert, for every single one: the dungeon is solvable, a trap-free path
exists and matches the recorded optimal move count, every clue sits on a real floor tile (never the
undiscoverable start tile), at least one clue is load-bearing, and any key/door gate is a genuine
chokepoint.

## Difficulty rhythm

Like many daily puzzle games, the week has a rhythm:

| Day(s) | Grid | Trap density | Key/door |
| --- | --- | --- | --- |
| Mon - Tue | 9x9 | ~10% | never |
| Wed - Thu | 10x10 | ~12% | sometimes |
| Fri - Sat | 11x11 | ~13% | usually |
| Sunday | 13x13 | ~15% | always |

## Project structure

```
src/
  game/        Pure game-logic engine: RNG, seeding, cave/grid generation, the clue/solver CSP,
               scoring, and local-storage persistence. No React dependencies - fully unit testable.
  hooks/       useGameState - the per-run state machine (movement, clue discovery, hints, win/loss).
  components/  React UI: board, HUD, controls, clue log, modals (How to Play / Stats / Results).
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm test` | Run the vitest suite (generator/solver correctness) |
| `npm run lint` | Run oxlint |

## Known limitations / ideas for a future version

- **No global leaderboard yet.** Stats, streaks, and personal bests are stored in the browser's
  `localStorage` only. A backend would be needed for real cross-player leaderboards; in the meantime,
  the "Share Result" button produces a Wordle-style spoiler-free summary you can paste anywhere to
  compare with friends.
- **No accounts/sync across devices.**
- Locked door/key puzzles only ever place a single gate per dungeon.
