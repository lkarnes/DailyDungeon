import { useMemo, useState } from 'react';
import { getDailyMap, getPracticeMap } from '../game/dailyMap';
import type { DungeonMap } from '../game/types';
import { getDateKey } from '../game/seed';
import { getResultForDate, getStats, saveResult, type LifetimeStats, type StoredResult } from '../game/storage';
import type { RunSummary } from '../game/scoring';
import { Header } from './Header';
import { GameSession } from './GameSession';
import { ResultsModal } from './ResultsModal';
import { HowToPlayModal } from './HowToPlayModal';
import { StatsModal } from './StatsModal';
import './App.css';

const SEEN_HOWTO_KEY = 'dd_seen_howto_v1';

export default function App() {
  const [now] = useState(() => new Date());
  const dateKey = useMemo(() => getDateKey(now), [now]);
  const dailyMap = useMemo(() => getDailyMap(now), [now]);

  const [existingResult, setExistingResult] = useState<StoredResult | null>(() => getResultForDate(dateKey));
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

  function closeHowTo() {
    setShowHowTo(false);
    try {
      window.localStorage.setItem(SEEN_HOWTO_KEY, '1');
    } catch {
      // Ignore storage failures (e.g. private browsing mode).
    }
  }

  function handleDailyFinish(summary: RunSummary) {
    const updatedStats = saveResult(dateKey, dailyMap.epoch, summary);
    setStats(updatedStats);
    setExistingResult(getResultForDate(dateKey));
    setResultDismissed(false);
  }

  function startPractice() {
    setPracticeRunId((id) => id + 1);
    setPracticeSummary(null);
    setPracticeMap(getPracticeMap(now));
  }

  function exitPractice() {
    setPracticeMap(null);
    setPracticeSummary(null);
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
        {inPracticeMode && practiceMap ? (
          <>
            <div className="practice-exit-row">
              <button type="button" className="app-header__btn" onClick={exitPractice}>
                ⬅ Back to Daily Dungeon
              </button>
            </div>
            <GameSession key={practiceRunId} map={practiceMap} isPractice onFinish={setPracticeSummary} />
          </>
        ) : (
          <GameSession
            key={dateKey}
            map={dailyMap}
            isPractice={false}
            onFinish={existingResult ? () => {} : handleDailyFinish}
          />
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

      {inPracticeMode && practiceSummary && (
        <ResultsModal
          summary={practiceSummary}
          epoch={dailyMap.epoch}
          difficultyLabel={dailyMap.difficultyLabel}
          stats={stats}
          onPractice={startPractice}
          onClose={exitPractice}
        />
      )}
    </div>
  );
}
