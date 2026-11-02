/**
 * Caches the generated map per (date, difficulty) combo (generation is
 * somewhat expensive and must be stable across re-renders within the same
 * session). Players choose their own difficulty each day rather than it
 * being forced by the day of the week, so a given date can have several
 * independently-cached dungeons - one per difficulty.
 */
import type { DungeonMap } from './types';
import { generateDungeonMap, generateWithRetries } from './generator';
import { getDateKey, getPracticeSeed, DIFFICULTY_PRESETS, type DifficultyName } from './seed';

const cache = new Map<string, DungeonMap>();

/** Returns today's Daily Dungeon map for the given difficulty (generated once per date+difficulty, then cached in memory). */
export function getDailyMap(difficultyName: DifficultyName, now: Date = new Date()): DungeonMap {
  const dateKey = getDateKey(now);
  const cacheKey = `${dateKey}:${difficultyName}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const map = generateDungeonMap(dateKey, difficultyName);
  cache.set(cacheKey, map);
  return map;
}

/** Returns a fresh, non-deterministic practice map at the given difficulty (doesn't affect daily stats/streaks). */
export function getPracticeMap(difficultyName: DifficultyName, now: Date = new Date()): DungeonMap {
  const dateKey = getDateKey(now);
  const difficulty = DIFFICULTY_PRESETS[difficultyName];
  const map = generateWithRetries(dateKey, difficulty, () => getPracticeSeed());
  if (map) return map;
  const fallbackDifficulty = { ...difficulty, rows: 9, cols: 9, allowKeyDoor: false, keyDoorChance: 0, gateCountRange: [0, 0] as [number, number] };
  const fallbackMap = generateWithRetries(dateKey, fallbackDifficulty, () => getPracticeSeed());
  if (fallbackMap) return fallbackMap;
  throw new Error('Failed to generate a practice dungeon. Please try again.');
}
