/** End-of-run summary: score, move efficiency vs. optimal, streak, and share/practice actions. */
import { useState } from 'react';
import { Modal } from './Modal';
import type { RunSummary } from '../game/scoring';
import { buildShareText, formatDuration, getScoreBadge } from '../game/scoring';
import type { LifetimeStats } from '../game/storage';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="results__stat">
      <span className="results__stat-value">{value}</span>
      <span className="results__stat-label">{label}</span>
    </div>
  );
}

interface ResultsModalProps {
  summary: RunSummary;
  epoch: number;
  difficultyLabel: string;
  stats: LifetimeStats;
  onPractice: () => void;
  onClose?: () => void;
  alreadyPlayed?: boolean;
  isPractice?: boolean;
}

export function ResultsModal({ summary, epoch, difficultyLabel, stats, onPractice, onClose, alreadyPlayed, isPractice }: ResultsModalProps) {
  const [copied, setCopied] = useState(false);
  const diff = summary.movesUsed - summary.optimalMoves;
  const badge = getScoreBadge(summary);

  async function handleShare() {
    const text = buildShareText(summary, epoch, difficultyLabel, isPractice);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context); silently ignore.
    }
  }

  return (
    <Modal title={isPractice ? (summary.trapTriggered ? 'You were caught! (Practice)' : 'Practice escape complete') : summary.trapTriggered ? 'You were caught!' : 'Daily escape complete'} onClose={onClose}>
      <div className="results">
        {isPractice && <p className="results__practice-banner">🛠️ PRACTICE MODE - not counted toward your daily score or streak</p>}
        {alreadyPlayed && <p className="results__already-played">You already played Daily Dungeon #{epoch} today. Here&rsquo;s how you did:</p>}
        <div className="results__badge" title={badge.label} aria-hidden="true">
          {badge.emoji}
        </div>
        <p className="results__badge-label">{badge.label}</p>
        <div className="results__score-block">
          <span className="results__score">{summary.score}</span>
          <span className="results__score-caption">SCORE</span>
        </div>

        {summary.trapTriggered ? (
          <p className="results__message">
            You triggered a hidden trap after {summary.movesUsed}             moves ({formatDuration(summary.elapsedMs)}).{' '}
                        {isPractice ? 'Try another practice run!' : 'Come back tomorrow for a new dungeon!'}
          </p>
        ) : (
          <>
            <div className="results__grid">
              <Stat label="Moves used" value={summary.movesUsed} />
              <Stat label="Optimal moves" value={summary.optimalMoves} />
              <Stat label="Time" value={formatDuration(summary.elapsedMs)} />
              <Stat label="Clues discovered" value={`${summary.cluesDiscovered} / ${summary.totalClues}`} />
            </div>
            <p className="results__tagline">
              {diff <= 0 ? '✨ Perfect route - no wasted moves!' : `${diff} move${diff === 1 ? '' : 's'} away from optimal!`}
            </p>
          </>
        )}

        {!isPractice && (
          <div className="results__streak">
            🔥 Current streak: {stats.currentStreak} day{stats.currentStreak === 1 ? '' : 's'} &middot; Best: {stats.maxStreak}
          </div>
        )}

        <div className="results__actions">
          <button type="button" className="results__btn" onClick={handleShare}>
            {copied ? '✅ Copied!' : '📋 Share Result'}
          </button>
          <button type="button" className="results__btn results__btn--secondary" onClick={onPractice}>
            {isPractice ? '🎲 Another Practice Run' : '🎲 Practice Mode'}
          </button>
        </div>
        {!isPractice && <p className="results__next">A brand-new Daily Dungeon unlocks tomorrow.</p>}
      </div>
    </Modal>
  );
}
