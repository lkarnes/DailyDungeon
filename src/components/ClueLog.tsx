/** Scrollable log of discovered clues and game events; the clue(s) on the player's current tile are highlighted and auto-scrolled into view, while older clues remain reachable by scrolling up. */
import { useEffect, useRef } from 'react';
import type { GameState, LogEntry } from '../hooks/useGameState';
import { posKey } from '../game/types';

const CLUE_ICON: Record<string, string> = {
  numerical: '🔢',
  specific: '🎯',
  proximity: '📍',
  environmental: '🕸️',
  directional: '🧭',
  connection: '🔗',
  lever: '🕹️',
};

function LogRow({ entry, index, isCurrent, rowRef }: { entry: LogEntry; index: number; isCurrent: boolean; rowRef?: (el: HTMLLIElement | null) => void }) {
  if (entry.kind === 'event') {
    return (
      <li className="clue-log__row clue-log__row--event" key={index}>
        {entry.text}
      </li>
    );
  }
  return (
    <li className={`clue-log__row ${isCurrent ? 'clue-log__row--current' : ''}`} key={entry.clue.id} ref={rowRef}>
      <span className="clue-log__icon" aria-hidden="true">
        {CLUE_ICON[entry.clue.kind] ?? '📜'}
      </span>
      <span className="clue-log__text">{entry.clue.text}</span>
    </li>
  );
}

export function ClueLog({ state }: { state: GameState }) {
  const playerKey = posKey(state.playerPos);
  const currentClueIds = new Set(state.map.clues.filter((c) => posKey(c.tile) === playerKey).map((c) => c.id));
  const lastCurrentRowRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    lastCurrentRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [playerKey]);

  // Find the index of the last log entry belonging to the current tile, so only that one gets the scroll ref
  // (there may be several stacked clues on one tile; scrolling to the last keeps the whole group in view).
  let lastCurrentIndex = -1;
  state.log.forEach((entry, i) => {
    if (entry.kind === 'clue' && currentClueIds.has(entry.clue.id)) lastCurrentIndex = i;
  });

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
            <LogRow
              entry={entry}
              index={i}
              key={i}
              isCurrent={entry.kind === 'clue' && currentClueIds.has(entry.clue.id)}
              rowRef={i === lastCurrentIndex ? (el) => (lastCurrentRowRef.current = el) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
