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
  args: { completed: boolean; trapTriggered: boolean; movesUsed: number; cluesDiscovered: number; collectiblesFound: number; hintsUsed: number },
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
  };
}

/** Builds a Wordle-style shareable text block (no spoilers, no map details). */
export function buildShareText(summary: RunSummary, epoch: number, difficultyLabel: string): string {
  const lines: string[] = [];
  lines.push(`Daily Dungeon #${epoch} (${difficultyLabel})`);
  if (summary.trapTriggered) {
    lines.push(`💀 Caught in a trap after ${summary.movesUsed} moves.`);
  } else if (summary.completed) {
    const diff = summary.movesUsed - summary.optimalMoves;
    lines.push(`🏆 Escaped in ${summary.movesUsed} moves (optimal: ${summary.optimalMoves})`);
    lines.push(diff <= 0 ? '✨ Perfect route!' : `${diff} move${diff === 1 ? '' : 's'} off optimal`);
  }
  lines.push(`📜 Clues: ${summary.cluesDiscovered}/${summary.totalClues}  ⭐ Score: ${summary.score}`);
  if (summary.hintsUsed > 0) lines.push(`🔦 Hints used: ${summary.hintsUsed}`);
  return lines.join('\n');
}
