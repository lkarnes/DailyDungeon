/** Scoring rules and helpers for summarizing a finished (or failed) run. */
import type { DungeonMap } from './types';

export const SCORING = {
  BASE_COMPLETE: 1000,
  PER_MOVE: -10,
  PER_CLUE: 25,
  NO_HINTS_BONUS: 100,
  PER_COLLECTIBLE: 50,
  PER_HINT: -50,
} as const;

export interface RunSummary {
  completed: boolean;
  trapTriggered: boolean;
  movesUsed: number;
  optimalMoves: number;
  cluesDiscovered: number;
  totalClues: number;
  collectiblesFound: number;
  totalCollectibles: number;
  hintsUsed: number;
  score: number;
  /** Total wall-clock time spent on the run, in milliseconds. Informational only - never affects scoring. */
  elapsedMs: number;
  /** Per-move trail used for the shareable result: 'progress' = closer to the exit, 'detour' = sideways/backtrack. */
  trail: ('progress' | 'detour')[];
}

export function computeScore(args: {
  completed: boolean;
  movesUsed: number;
  cluesDiscovered: number;
  collectiblesFound: number;
  hintsUsed: number;
}): number {
  if (!args.completed) return 0;
  let score = SCORING.BASE_COMPLETE;
  score += args.movesUsed * SCORING.PER_MOVE;
  score += args.cluesDiscovered * SCORING.PER_CLUE;
  score += args.collectiblesFound * SCORING.PER_COLLECTIBLE;
  score += args.hintsUsed * SCORING.PER_HINT;
  if (args.hintsUsed === 0) score += SCORING.NO_HINTS_BONUS;
  return Math.max(0, Math.round(score));
}

export function buildSummary(
  map: DungeonMap,
  args: {
    completed: boolean;
    trapTriggered: boolean;
    movesUsed: number;
    cluesDiscovered: number;
    collectiblesFound: number;
    hintsUsed: number;
    elapsedMs: number;
    trail: ('progress' | 'detour')[];
  },
): RunSummary {
  return {
    completed: args.completed,
    trapTriggered: args.trapTriggered,
    movesUsed: args.movesUsed,
    optimalMoves: map.optimalMoves,
    cluesDiscovered: args.cluesDiscovered,
    totalClues: map.clues.length,
    collectiblesFound: args.collectiblesFound,
    totalCollectibles: map.collectibles.length,
    hintsUsed: args.hintsUsed,
    score: computeScore(args),
    elapsedMs: args.elapsedMs,
    trail: args.trail,
  };
}

export interface ScoreBadge {
  emoji: string;
  label: string;
}

/**
 * Picks a single emoji/label badge summarizing how the run went, from a
 * perfect 👑 crown (optimal moves, every treasure found, no hints) down to
 * a 💀 skull if a trap ended the run.
 */
export function getScoreBadge(summary: RunSummary): ScoreBadge {
  if (summary.trapTriggered) return { emoji: '💀', label: 'Caught!' };
  if (!summary.completed) return { emoji: '❔', label: 'Unfinished' };

  const diff = summary.movesUsed - summary.optimalMoves;
  const foundAllTreasure = summary.totalCollectibles === 0 || summary.collectiblesFound === summary.totalCollectibles;
  const flawless = diff <= 0 && summary.hintsUsed === 0;

  if (flawless && foundAllTreasure) return { emoji: '👑', label: 'Perfect Run!' };
  if (flawless) return { emoji: '🏆', label: 'Flawless Route' };
  if (diff <= 2 && summary.hintsUsed === 0) return { emoji: '🥇', label: 'Great Run' };
  if (diff <= 5) return { emoji: '🥈', label: 'Good Run' };
  return { emoji: '🥉', label: 'Escaped' };
}

/** Formats milliseconds as "m:ss" (or "h:mm:ss" for very long runs). */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

const TRAIL_ROW_SIZE = 10;

/** Renders the move trail as rows of colored squares, Wordle-style, ending in the summary's score badge. */
function buildTrailGrid(summary: RunSummary): string {
  const squares: string[] = summary.trail.map((step) => (step === 'progress' ? '🟩' : '🟨'));
  squares.push(getScoreBadge(summary).emoji);
  const rows: string[] = [];
  for (let i = 0; i < squares.length; i += TRAIL_ROW_SIZE) {
    rows.push(squares.slice(i, i + TRAIL_ROW_SIZE).join(''));
  }
  return rows.join('\n');
}

/** Builds a Wordle-style shareable text block (no spoilers, no map details). */
export function buildShareText(summary: RunSummary, epoch: number, difficultyLabel: string, isPractice = false): string {
  const badge = getScoreBadge(summary);
  const lines: string[] = [];
  lines.push(
    isPractice
      ? `${badge.emoji} Daily Dungeon PRACTICE 🛠️ (${difficultyLabel}) - ${badge.label}`
      : `${badge.emoji} Daily Dungeon #${epoch} (${difficultyLabel}) - ${badge.label}`,
  );
  lines.push(buildTrailGrid(summary));
  if (summary.trapTriggered) {
    lines.push(`💀 Caught in a trap after ${summary.movesUsed} moves.`);
  } else if (summary.completed) {
    const diff = summary.movesUsed - summary.optimalMoves;
    lines.push(`🏆 Escaped in ${summary.movesUsed} moves (optimal: ${summary.optimalMoves})`);
    lines.push(diff <= 0 ? '✨ Perfect route!' : `${diff} move${diff === 1 ? '' : 's'} off optimal`);
  }
  lines.push(`📜 Clues: ${summary.cluesDiscovered}/${summary.totalClues}  ⭐ Score: ${summary.score}  ⏱️ ${formatDuration(summary.elapsedMs)}`);
  if (summary.hintsUsed > 0) lines.push(`🔦 Hints used: ${summary.hintsUsed}`);
  return lines.join('\n');
}
