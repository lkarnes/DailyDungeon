/** Scrollable log of discovered clues and game events; also doubles as the "review known information" panel. */
import type { GameState, LogEntry } from '../hooks/useGameState';

const CLUE_ICON: Record<string, string> = {
  numerical: '🔢',
  specific: '🎯',
  proximity: '📍',
  environmental: '🪨',
  directional: '🧭',
  connection: '🔗',
};

function LogRow({ entry, index }: { entry: LogEntry; index: number }) {
  if (entry.kind === 'event') {
    return (
      <li className="clue-log__row clue-log__row--event" key={index}>
        {entry.text}
      </li>
    );
  }
  return (
    <li className="clue-log__row" key={entry.clue.id}>
      <span className="clue-log__icon" aria-hidden="true">
        {CLUE_ICON[entry.clue.kind] ?? '📜'}
      </span>
      <span className="clue-log__text">{entry.clue.text}</span>
    </li>
  );
}

export function ClueLog({ state }: { state: GameState }) {
  return (
    <div className="clue-log">
      <h2 className="clue-log__title">
        Clue Log <span className="clue-log__count">{state.discoveredClueIds.size}/{state.map.clues.length}</span>
      </h2>
      {state.log.length === 0 ? (
        <p className="clue-log__empty">Explore the dungeon to uncover clues about hidden traps.</p>
      ) : (
        <ul className="clue-log__list">
          {state.log.map((entry, i) => (
            <LogRow entry={entry} index={i} key={i} />
          ))}
        </ul>
      )}
    </div>
  );
}
