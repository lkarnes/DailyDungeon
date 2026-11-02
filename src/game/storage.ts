/** Local persistence: per-day results, streaks, and lifetime stats. No backend required for v1. */
import type { RunSummary } from './scoring';

const RESULTS_KEY = 'dd_results_v1';
const STATS_KEY = 'dd_stats_v1';

export interface StoredResult extends RunSummary {
  dateKey: string;
  epoch: number;
  completedAt: string;
}

export interface LifetimeStats {
  gamesPlayed: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  lastPlayedDateKey: string | null;
  bestScore: number;
  totalScore: number;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

export function getAllResults(): Record<string, StoredResult> {
  if (!hasStorage()) return {};
  return safeParse(window.localStorage.getItem(RESULTS_KEY), {} as Record<string, StoredResult>);
}

export function getResultForDate(dateKey: string): StoredResult | null {
  const all = getAllResults();
  return all[dateKey] ?? null;
}

export function getStats(): LifetimeStats {
  if (!hasStorage()) {
    return { gamesPlayed: 0, wins: 0, currentStreak: 0, maxStreak: 0, lastPlayedDateKey: null, bestScore: 0, totalScore: 0 };
  }
  return safeParse(window.localStorage.getItem(STATS_KEY), {
    gamesPlayed: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0,
    lastPlayedDateKey: null,
    bestScore: 0,
    totalScore: 0,
  });
}

function dayBefore(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Saves today's result and updates streak/lifetime stats. Idempotent: calling twice for the same day keeps the first result. */
export function saveResult(dateKey: string, epoch: number, summary: RunSummary): LifetimeStats {
  const stats = getStats();
  if (!hasStorage()) return stats;

  const all = getAllResults();
  if (all[dateKey]) return stats; // one official attempt per day

  all[dateKey] = { ...summary, dateKey, epoch, completedAt: new Date().toISOString() };
  window.localStorage.setItem(RESULTS_KEY, JSON.stringify(all));

  const won = summary.completed && !summary.trapTriggered;
  const continuesStreak = stats.lastPlayedDateKey === dayBefore(dateKey);
  const nextStreak = won ? (continuesStreak ? stats.currentStreak + 1 : 1) : 0;

  const next: LifetimeStats = {
    gamesPlayed: stats.gamesPlayed + 1,
    wins: stats.wins + (won ? 1 : 0),
    currentStreak: nextStreak,
    maxStreak: Math.max(stats.maxStreak, nextStreak),
    lastPlayedDateKey: dateKey,
    bestScore: Math.max(stats.bestScore, summary.score),
    totalScore: stats.totalScore + summary.score,
  };
  window.localStorage.setItem(STATS_KEY, JSON.stringify(next));
  return next;
}
