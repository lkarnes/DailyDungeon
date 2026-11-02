import { useMemo, useState } from 'react';
import { getDailyMap, getPracticeMap } from '../game/dailyMap';
import type { DungeonMap } from '../game/types';
import { getDateKey, DIFFICULTY_NAMES, DEFAULT_DIFFICULTY, type DifficultyName } from '../game/seed';
import { getAllResults, getResult, getStats, saveResult, type LifetimeStats, type StoredResult } from '../game/storage';
import type { RunSummary } from '../game/scoring';
import { Header } from './Header';
import { DifficultySelector } from './DifficultySelector';
import { GameSession } from './GameSession';
import { DungeonReview } from './DungeonReview';
import { ResultsModal } from './ResultsModal';
import { HowToPlayModal } from './HowToPlayModal';
import { StatsModal } from './StatsModal';
import './App.css';

const SEEN_HOWTO_KEY = 'dd_seen_howto_v1';
const SELECTED_DIFFICULTY_KEY = 'dd_selected_difficulty_v1';

function loadSelectedDifficulty(): DifficultyName {
  try {
    const stored = window.localStorage.getItem(SELECTED_DIFFICULTY_KEY);
    if (stored && (DIFFICULTY_NAMES as string[]).includes(stored)) return stored as DifficultyName;
  } catch {
    // Ignore storage failures (e.g. private browsing mode).
  }
  return DEFAULT_DIFFICULTY;
}

export default function App() {
  const [now] = useState(() => new Date());
  const dateKey = useMemo(() => getDateKey(now), [now]);

  const [difficulty, setDifficulty] = useState<DifficultyName>(loadSelectedDifficulty);
  const dailyMap = useMemo(() => getDailyMap(difficulty, now), [difficulty, now]);

  const [existingResult, setExistingResult] = useState<StoredResult | null>(() => getResult(dateKey, difficulty));
  const [stats, setStats] = useState<LifetimeStats>(() => getStats());
  const [showHowTo, setShowHowTo] = useState(() => {
    try {
      return window.localStorage.getItem(SEEN_HOWTO_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [showStats, setShowStats] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [practiceMap, setPracticeMap] = useState<DungeonMap | null>(null);
  const [practiceSummary, setPracticeSummary] = useState<RunSummary | null>(null);
  const [practiceRunId, setPracticeRunId] = useState(0);
  const [practiceDismissed, setPracticeDismissed] = useState(false);

  const completedToday = useMemo(() => {
    // `existingResult` isn't read directly here, but it's the dependency that
    // tells us localStorage changed (getAllResults() itself isn't reactive).
    void existingResult;
    const all = getAllResults();
    return DIFFICULTY_NAMES.filter((name) => all[`${dateKey}:${name}`] != null);
  }, [dateKey, existingResult]);

  function closeHowTo() {
    setShowHowTo(false);
    try {
      window.localStorage.setItem(SEEN_HOWTO_KEY, '1');
    } catch {
      // Ignore storage failures (e.g. private browsing mode).
    }
  }

  function selectDifficulty(name: DifficultyName) {
    setDifficulty(name);
    setResultDismissed(false);
    setExistingResult(getResult(dateKey, name));
    try {
      window.localStorage.setItem(SELECTED_DIFFICULTY_KEY, name);
    } catch {
      // Ignore storage failures (e.g. private browsing mode).
    }
    // Switching difficulty mid-practice-run just starts a fresh practice
    // dungeon at the new difficulty immediately - there's no daily progress
    // to lose in practice mode.
    if (practiceMap !== null) {
      setPracticeRunId((id) => id + 1);
      setPracticeSummary(null);
      setPracticeDismissed(false);
      setPracticeMap(getPracticeMap(name, now));
    }
  }

  function handleDailyFinish(summary: RunSummary) {
    const updatedStats = saveResult(dateKey, difficulty, dailyMap.epoch, summary);
    setStats(updatedStats);
    setExistingResult(getResult(dateKey, difficulty));
    setResultDismissed(false);
  }

  function startPractice() {
    setPracticeRunId((id) => id + 1);
    setPracticeSummary(null);
    setPracticeDismissed(false);
    setPracticeMap(getPracticeMap(difficulty, now));
  }

  function exitPractice() {
    setPracticeMap(null);
    setPracticeSummary(null);
    setPracticeDismissed(false);
  }

  const inPracticeMode = practiceMap !== null;

  return (
    <div className="app">
      <Header
        epoch={dailyMap.epoch}
        difficultyLabel={dailyMap.difficultyLabel}
        onShowHowToPlay={() => setShowHowTo(true)}
        onShowStats={() => setShowStats(true)}
        onShowResult={existingResult && !inPracticeMode ? () => setResultDismissed(false) : undefined}
      />

      <main className="app__main">
        <DifficultySelector selected={difficulty} onSelect={selectDifficulty} completedNames={inPracticeMode ? [] : completedToday} />

        {inPracticeMode && practiceMap ? (
          <>
            <div className="practice-exit-row">
              <button type="button" className="app-header__btn" onClick={exitPractice}>
                ⬅ Back to Daily Dungeon
              </button>
              {practiceSummary && (
                <>
                  <button type="button" className="app-header__btn" onClick={() => setPracticeDismissed(false)}>
                    📜 Results
                  </button>
                  <button type="button" className="app-header__btn" onClick={startPractice}>
                    🔁 New practice run
                  </button>
                </>
              )}
            </div>
            <GameSession key={practiceRunId} map={practiceMap} isPractice onFinish={setPracticeSummary} />
          </>
        ) : existingResult ? (
          <DungeonReview map={dailyMap} result={existingResult} />
        ) : (
          <GameSession key={`${dateKey}:${difficulty}`} map={dailyMap} isPractice={false} onFinish={handleDailyFinish} />
        )}
      </main>

      {showHowTo && <HowToPlayModal onClose={closeHowTo} />}
      {showStats && <StatsModal stats={stats} onClose={() => setShowStats(false)} />}

      {!inPracticeMode && existingResult && !resultDismissed && (
        <ResultsModal
          summary={existingResult}
          epoch={dailyMap.epoch}
          difficultyLabel={dailyMap.difficultyLabel}
          stats={stats}
          onPractice={startPractice}
          onClose={() => setResultDismissed(true)}
          alreadyPlayed
        />
      )}

      {inPracticeMode && practiceSummary && !practiceDismissed && (
        <ResultsModal
          summary={practiceSummary}
          epoch={dailyMap.epoch}
          difficultyLabel={dailyMap.difficultyLabel}
          stats={stats}
          onPractice={startPractice}
          onClose={() => setPracticeDismissed(true)}
          isPractice
        />
      )}
    </div>
  );
}
