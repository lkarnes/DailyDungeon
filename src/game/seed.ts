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

/** Builds the base RNG seed string for a given date key. Generation attempts append a suffix. */
export function getDailySeed(dateKey: string, attempt = 0): string {
  return attempt === 0
    ? `${GAME_NAMESPACE}-${dateKey}`
    : `${GAME_NAMESPACE}-${dateKey}-retry${attempt}`;
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
 * Weekly difficulty rhythm, like many daily-puzzle games: the week builds up
 * to a tougher, larger "Dungeon Sunday" and eases off early in the week.
 */
export function getDifficultyForDate(date: Date): DungeonDifficulty {
  const day = date.getDay(); // 0 = Sunday ... 6 = Saturday
  switch (day) {
    case 0: // Sunday - the big one
      return {
        rows: 13,
        cols: 13,
        trapRate: 0.17,
        allowKeyDoor: true,
        keyDoorChance: 1,
        collectibleCount: 3,
        gateCountRange: [2, 3],
        permanentBlockRate: 0.05,
        label: 'Treacherous',
      };
    case 5: // Friday
    case 6: // Saturday
      return {
        rows: 11,
        cols: 11,
        trapRate: 0.15,
        allowKeyDoor: true,
        keyDoorChance: 0.7,
        collectibleCount: 2,
        gateCountRange: [1, 2],
        permanentBlockRate: 0.04,
        label: 'Hard',
      };
    case 3: // Wednesday
    case 4: // Thursday
      return {
        rows: 10,
        cols: 10,
        trapRate: 0.13,
        allowKeyDoor: true,
        keyDoorChance: 0.35,
        collectibleCount: 1,
        gateCountRange: [0, 2],
        permanentBlockRate: 0.03,
        label: 'Medium',
      };
    default: // Monday, Tuesday
      return {
        rows: 9,
        cols: 9,
        trapRate: 0.11,
        allowKeyDoor: false,
        keyDoorChance: 0,
        collectibleCount: 1,
        gateCountRange: [0, 1],
        permanentBlockRate: 0.02,
        label: 'Easy',
      };
  }
}
