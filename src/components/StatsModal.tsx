/** Lifetime stats modal: streaks, win rate, best score. */
import { Modal } from './Modal';
import type { LifetimeStats } from '../game/storage';

export function StatsModal({ stats, onClose }: { stats: LifetimeStats; onClose: () => void }) {
  const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
  const avgScore = stats.gamesPlayed > 0 ? Math.round(stats.totalScore / stats.gamesPlayed) : 0;
  return (
    <Modal title="Your Stats" onClose={onClose}>
      <div className="stats-grid">
        <div className="stats-grid__item">
          <span className="stats-grid__value">{stats.gamesPlayed}</span>
          <span className="stats-grid__label">Played</span>
        </div>
        <div className="stats-grid__item">
          <span className="stats-grid__value">{winRate}%</span>
          <span className="stats-grid__label">Win rate</span>
        </div>
        <div className="stats-grid__item">
          <span className="stats-grid__value">{stats.currentStreak}</span>
          <span className="stats-grid__label">Current streak</span>
        </div>
        <div className="stats-grid__item">
          <span className="stats-grid__value">{stats.maxStreak}</span>
          <span className="stats-grid__label">Best streak</span>
        </div>
        <div className="stats-grid__item">
          <span className="stats-grid__value">{stats.bestScore}</span>
          <span className="stats-grid__label">Best score</span>
        </div>
        <div className="stats-grid__item">
          <span className="stats-grid__value">{avgScore}</span>
          <span className="stats-grid__label">Average score</span>
        </div>
      </div>
      <p className="stats-note">
        Stats are stored locally in this browser. Clearing site data will reset them. A global leaderboard may arrive in a
        future update once Daily Dungeon has a backend.
      </p>
    </Modal>
  );
}
