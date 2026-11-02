/**
 * Caches the generated map per date key (generation is somewhat expensive
 * and must be stable across re-renders within the same session).
 */
import type { DungeonMap } from './types';
import { generateDungeonMap, generateWithRetries } from './generator';
import { getDateKey, getPracticeSeed, getDifficultyForDate } from './seed';

const cache = new Map<string, DungeonMap>();

/** Returns today's Daily Dungeon map (generated once per date key, then cached in memory). */
export function getDailyMap(now: Date = new Date()): DungeonMap {
  const dateKey = getDateKey(now);
  const cached = cache.get(dateKey);
  if (cached) return cached;
  const map = generateDungeonMap(dateKey, now);
  cache.set(dateKey, map);
  return map;
}

/** Returns a fresh, non-deterministic practice map (doesn't affect daily stats/streaks). */
export function getPracticeMap(now: Date = new Date()): DungeonMap {
  const dateKey = getDateKey(now);
  const difficulty = getDifficultyForDate(now);
  const map = generateWithRetries(dateKey, difficulty, () => getPracticeSeed());
  if (map) return map;
  const fallbackDifficulty = { ...difficulty, rows: 9, cols: 9, allowKeyDoor: false, keyDoorChance: 0 };
  const fallbackMap = generateWithRetries(dateKey, fallbackDifficulty, () => getPracticeSeed());
  if (fallbackMap) return fallbackMap;
  throw new Error('Failed to generate a practice dungeon. Please try again.');
}
