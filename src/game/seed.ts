/**
 * Daily seed utilities. Everything about "which puzzle do we generate" flows
 * from a calendar date key (YYYY-MM-DD, in the player's local timezone), so
 * every player on the same day gets the exact same dungeon.
 */

/** The date the game "launched" - day #1 of the daily puzzle sequence. */
export const LAUNCH_DATE_KEY = '2024-01-01';

const GAME_NAMESPACE = 'daily-dungeon-v1';

/** Formats a Date as a local YYYY-MM-DD string (not UTC, so it matches the player's calendar day). */
export function getDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns the 1-indexed "Daily Dungeon #" number for a given date key. */
export function getEpoch(dateKey: string): number {
  const start = new Date(`${LAUNCH_DATE_KEY}T00:00:00`);
  const cur = new Date(`${dateKey}T00:00:00`);
  const diffDays = Math.round((cur.getTime() - start.getTime()) / 86_400_000);
  return Math.max(0, diffDays) + 1;
}

/** Builds the base RNG seed string for a given date key and chosen difficulty. Generation attempts append a suffix. */
export function getDailySeed(dateKey: string, difficultyName: string, attempt = 0): string {
  const base = `${GAME_NAMESPACE}-${dateKey}-${difficultyName}`;
  return attempt === 0 ? base : `${base}-retry${attempt}`;
}

/** Builds a non-deterministic seed for "practice" rounds that don't affect daily stats. */
export function getPracticeSeed(): string {
  return `${GAME_NAMESPACE}-practice-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export type DungeonDifficulty = {
  rows: number;
  cols: number;
  trapRate: number;
  allowKeyDoor: boolean;
  keyDoorChance: number;
  collectibleCount: number;
  /** Inclusive [min, max] number of hidden switch/blocked-tile gates to attempt to place. */
  gateCountRange: [number, number];
  /** Fraction of floor tiles converted into permanent, non-removable obstacles. */
  permanentBlockRate: number;
  label: string;
};

/**
 * Named difficulty presets, shared by the daily weekly rhythm and Practice
 * Mode's difficulty picker. Order matters for the Practice Mode UI (easiest first).
 */
export const DIFFICULTY_PRESETS = {
  Easy: {
    rows: 9,
    cols: 9,
    trapRate: 0.11,
    allowKeyDoor: false,
    keyDoorChance: 0,
    collectibleCount: 1,
    gateCountRange: [1, 2],
    permanentBlockRate: 0.02,
    label: 'Easy',
  },
  Medium: {
    rows: 10,
    cols: 10,
    trapRate: 0.13,
    allowKeyDoor: true,
    keyDoorChance: 0.35,
    collectibleCount: 1,
    gateCountRange: [2, 3],
    permanentBlockRate: 0.03,
    label: 'Medium',
  },
  Hard: {
    rows: 11,
    cols: 11,
    trapRate: 0.15,
    allowKeyDoor: true,
    keyDoorChance: 0.7,
    collectibleCount: 2,
    gateCountRange: [2, 3],
    permanentBlockRate: 0.04,
    label: 'Hard',
  },
  Treacherous: {
    rows: 13,
    cols: 13,
    trapRate: 0.17,
    allowKeyDoor: true,
    keyDoorChance: 1,
    collectibleCount: 3,
    gateCountRange: [2, 4],
    permanentBlockRate: 0.05,
    label: 'Treacherous',
  },
} satisfies Record<string, DungeonDifficulty>;

export type DifficultyName = keyof typeof DIFFICULTY_PRESETS;

export const DIFFICULTY_NAMES = Object.keys(DIFFICULTY_PRESETS) as DifficultyName[];

/** The difficulty selected by default for a first-time player (before they've chosen one). */
export const DEFAULT_DIFFICULTY: DifficultyName = 'Medium';
