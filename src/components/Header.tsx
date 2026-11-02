/** App header: title, puzzle number/difficulty, and nav buttons. */
interface HeaderProps {
  epoch: number;
  difficultyLabel: string;
  onShowHowToPlay: () => void;
  onShowStats: () => void;
  onShowResult?: () => void;
}

export function Header({ epoch, difficultyLabel, onShowHowToPlay, onShowStats, onShowResult }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__title">
        <span className="app-header__emoji" aria-hidden="true">
          🏰
        </span>
        <div>
          <h1>Daily Dungeon</h1>
          <p className="app-header__subtitle">
            #{epoch} &middot; {difficultyLabel}
          </p>
        </div>
      </div>
      <nav className="app-header__nav">
        {onShowResult && (
          <button type="button" className="app-header__btn" onClick={onShowResult}>
            🏆 Today&rsquo;s Result
          </button>
        )}
        <button type="button" className="app-header__btn" onClick={onShowStats}>
          📊 Stats
        </button>
        <button type="button" className="app-header__btn" onClick={onShowHowToPlay}>
          ❓ How to Play
        </button>
      </nav>
    </header>
  );
}
