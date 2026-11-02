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

### Deploying

It's a static site (no backend; results live in localStorage). Build command `npm run build`,
output directory `dist`. Connect the GitHub repo to Vercel, Netlify, or Cloudflare Pages and use those settings.

## Gameplay loop

1. **Choose your difficulty** - Easy, Medium, Hard, or Treacherous. Nothing is forced by the day of
   the week; you pick the tier you want to play, and you can play more than one tier on the same
   day (each is tracked and scored independently). Your dungeon is still generated deterministically
   from today's date + chosen difficulty, so everyone who picks the same tier on the same day gets
   the identical dungeon.
2. **Explore** - move with the arrow keys, `WASD`, the on-screen arrow buttons, or by clicking an
   adjacent tile. Moving costs one "move"; nothing else does.
3. **Uncover clues** - walking onto a clue tile automatically reveals it and adds it to your Clue
   Log (free to re-read at any time). Clues are fogged for *unvisited* tiles only - once you've
   stood on a tile, its marker stays visible permanently, so you can always see on the map where
   each Clue Log entry came from, without being able to see clues you haven't reached yet.
4. **Deduce safe tiles** - combine clues to work out which tiles must be safe and which must hide a
   trap, the same way you would reason through a Minesweeper board.
5. **Clear obstacles** - locked doors need a key, rubble-blocked passages need a hidden lever (a
   lever clue always points the way); some rubble is permanent and can never be cleared, so you may
   need to find another route entirely.
6. **Reach the exit** - in as few moves as possible, without ever stepping on a trap.
7. **See your score** - moves used vs. the mathematically optimal route, time taken, clues
   discovered, hints used, and a final score, plus your streak and lifetime stats. The results
   screen reveals every clue, lever, and trap location on the full board so you can see exactly
   where things went right (or wrong) - whether you just finished a run or come back later the
   same day to review it.

Free, no-move-cost tools:
- 🚩 **Mark Trap** - flag a tile you suspect is dangerous, purely for your own bookkeeping.
- 🔦 **Scan** - (costs points and forfeits the "no hints" bonus) reveals whether one specific tile is
  a trap, limited to 3 uses per run.

Triggering a trap ends that run for that difficulty+day combo (one official attempt per
day-and-difficulty, like Wordle); your result is saved locally and shown again if you reload the
page. You can still pick a different difficulty to play more today. **Practice Mode** generates an
extra, non-deterministic dungeon at your currently-selected difficulty that you can retry as often
as you like without touching your daily stats or streak.

## Clue types

| Type | Example | Used by the solver to *prove* safety? |
| --- | --- | --- |
| 🔢 Numerical | "Exactly 2 traps among the 8 tiles surrounding this spot." | Yes |
| 🎯 Specific | "A trap is 2 tiles north, 1 tile east of here." | Yes |
| 📍 Proximity | "A trap is within 2 tiles of this spot." | Yes |
| 🕸️ Environmental | "The floor here is cracked - a trap is adjacent." | Yes |
| 🧭 Directional | "A trap lies somewhere north of this tile." | Yes |
| 🔗 Connection | "Two traps are aligned along the same row/column." | No - flavor/human reasoning aid only |
| 🕹️ Lever | "A hidden lever is 2 tiles south, 1 tile west of here." | N/A - always true, always guaranteed |

Each clue kind has several riddle-style phrasing variants (chosen randomly), so the dungeon reads a
little differently every day even when the underlying logic is the same. The main numeric/proximity
sweep is intentionally capped to a modest number of tiles per map - if that isn't quite enough to
prove a safe route, the generator tops up with the minimum number of guaranteed specific reveals
needed, so hint density stays reasonable without ever sacrificing solvability.

## Obstacles

| Obstacle | Cleared by | Notes |
| --- | --- | --- |
| 🔒 Locked door | Finding its key 🔑 anywhere in the dungeon | Opens permanently once you're carrying the key |
| 🧱 Brick wall | Finding and pulling its hidden lever 🕹️ | A lever clue is always guaranteed to point to it |
| ⛔ Impassable rubble | Never | A permanent dead end - route around it |

Keys/doors and switch/lever gates are independent mechanics and can both appear on the same day.
Harder days place more of each, plus more permanent rubble, which lengthens and complicates routes
without ever risking an unsolvable map (every placement is verified against the full route before
the dungeon is published).

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
possible, trap-free) route, plus how long the run took. Time is tracked purely for bragging rights -
there's no time pressure and it never affects your score.

## Daily generation & fairness guarantee

Everything is derived from a single seed string built from the player's local calendar date
(`daily-dungeon-v1-YYYY-MM-DD`), fed through a deterministic PRNG (`cyrb128` + `sfc32`). The same
date always produces the exact same dungeon for every player, with no server required.

Generation pipeline (see [`src/game/`](./src/game)):

1. **Cave layout** - a cellular-automaton cave is carved out of the grid, and only the largest
   connected floor region is kept ([`grid.ts`](./src/game/grid.ts)).
2. **Start & exit** - placed via double-BFS to maximize the distance between them.
3. **Traps** - scattered with light spacing so hazards aren't clustered unfairly.
4. **Key/door** - an optional, separate single-item lock: the door sits at a genuine graph
   *articulation point* (a provable chokepoint, found via cut-vertex detection), and its key is
   placed in start's reachable side of the graph once the door is removed.
5. **Switch/blocked-tile gates** - zero to three additional, independent gates. Each is placed the
   same chokepoint way as the key/door, but *nested*: every new gate assumes all previously-placed
   gates are still closed, so clearing them in sequence is always guaranteed to work. A reserved
   host tile is set aside for each gate's guaranteed lever clue.
6. **Permanent obstacles** - a handful of extra floor tiles are converted into permanently
   impassable "boulders" (never a wall - a real tile that could have been floor), each one verified
   not to break the already-finalized route (including every gate), to add maze complexity without
   ever risking an unsolvable map. Collectibles are sprinkled on whatever floor tiles remain
   ([`generator.ts`](./src/game/generator.ts)).
7. **Clues** - built up tile by tile (capped to keep hint density reasonable) until a
   logical-deduction solver can prove a safe path exists, topping up with the minimum number of
   guaranteed reveals if the cap wasn't quite enough, plus one guaranteed lever clue per gate
   ([`clues.ts`](./src/game/clues.ts)).
8. **Validation** - a constraint-propagation + bounded CSP solver
   ([`solver.ts`](./src/game/solver.ts)) simulates a perfectly careful player: a clue can only be
   "read" once its tile is part of the region already *proven* safe and connected to the start
   (accounting for which gates have been reached and opened so far). The generator only publishes a
   dungeon once this solver confirms the exit becomes provably reachable without ever requiring a
   blind guess. If a candidate map can't be proven solvable, the generator retries with a new seed
   variant (deterministically, so the result is still always the same for everyone on a given day).

This is the same core idea as a Minesweeper solver: numerical/specific/proximity/environmental/
directional clues become hard constraints (`exact`, `atLeastOne`, `specific`), combined with the
globally known trap count, and propagated to a fixpoint, falling back to bounded backtracking search
over small connected constraint components. "Connection" clues are included for flavor and genuine
human-usable information but are intentionally not relied upon by the automated proof. Lever clues
carry no trap constraint at all - they're guaranteed true statements about switch locations.

Automated tests ([`src/game/generator.test.ts`](./src/game/generator.test.ts)) regenerate dungeons
across 30 dates &times; all 4 difficulties (120 combinations) and assert, for every single one: the
dungeon is solvable, a trap-free path exists and matches the recorded optimal move count (accounting
for key/door and every gate), every clue sits on a real floor tile (never the undiscoverable start
tile), at least one clue is load-bearing, every gate is a genuine nested chokepoint with its switch
reachable beforehand and a matching lever clue, and every permanent block is baked into the terrain
without colliding with any reserved tile.

## Difficulty

Difficulty is a player choice, never forced by the day of the week - pick Easy, Medium, Hard, or
Treacherous from the selector, any day, and switch any time (your daily attempt is tracked
separately per difficulty, so you can play more than one tier the same day):

| Difficulty | Grid | Trap density | Key/door | Gates | Permanent blocks |
| --- | --- | --- | --- | --- | --- |
| Easy | 9x9 | ~11% | never | 1-2 | ~2% of floor |
| Medium | 10x10 | ~13% | sometimes | 2-3 | ~3% of floor |
| Hard | 11x11 | ~15% | usually | 2-3 | ~4% of floor |
| Treacherous | 13x13 | ~17% | always | 2-4 | ~5% of floor |

Each date+difficulty combination is generated from its own independent seed, so "Hard" on a given
day is the same dungeon for everyone who picks Hard that day, regardless of who's also playing Easy
or Treacherous.

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
  the "Share Result" button produces a Wordle-style spoiler-free summary (a row of 🟩/🟨 squares - one
  per move, green for progress toward the exit and yellow for a detour - plus score, moves, time, and
  clue count) you can paste anywhere to compare with friends.
- **No accounts/sync across devices.**
