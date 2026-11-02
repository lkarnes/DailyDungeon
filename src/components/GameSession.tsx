/** A single playable run (daily or practice): board, HUD, controls, clue log, and keyboard input. */
import { useEffect, useRef, useState } from 'react';
import type { DungeonMap, Position } from '../game/types';
import { posKey } from '../game/types';
import { useGameState, type Direction } from '../hooks/useGameState';
import { Board } from './Board';
import { Hud } from './Hud';
import { Controls } from './Controls';
import { ClueLog } from './ClueLog';
import type { RunSummary } from '../game/scoring';

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
};

interface GameSessionProps {
  map: DungeonMap;
  isPractice: boolean;
  onFinish: (summary: RunSummary) => void;
}

export function GameSession({ map, isPractice, onFinish }: GameSessionProps) {
  const { state, move, toggleFlag, scan, summary } = useGameState(map);
  const [flagMode, setFlagMode] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (summary && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(summary);
    }
  }, [summary, onFinish]);

  useEffect(() => {
    if (flagMode || scanMode) return; // avoid accidental movement while in a tool mode
    const handler = (e: KeyboardEvent) => {
      const dir = KEY_TO_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      move(dir);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [move, flagMode, scanMode]);

  function handleTileClick(pos: Position) {
    if (state.status !== 'playing') return;
    if (scanMode) {
      scan(pos);
      setScanMode(false);
      return;
    }
    if (flagMode) {
      toggleFlag(pos);
      return;
    }
    const dr = pos.row - state.playerPos.row;
    const dc = pos.col - state.playerPos.col;
    if (Math.abs(dr) + Math.abs(dc) !== 1) return;
    if (dr === -1) move('up');
    else if (dr === 1) move('down');
    else if (dc === -1) move('left');
    else if (dc === 1) move('right');
  }

  return (
    <div className="game-session">
      {isPractice && <div className="practice-banner">🎲 Practice Mode - this run doesn&rsquo;t affect your daily stats or streak.</div>}
      <Hud
        state={state}
        flagMode={flagMode}
        scanMode={scanMode}
        onToggleFlagMode={() => {
          setFlagMode((v) => !v);
          setScanMode(false);
        }}
        onToggleScanMode={() => {
          setScanMode((v) => !v);
          setFlagMode(false);
        }}
      />
      <div className="game-session__main">
        <Board map={map} state={state} onTileClick={handleTileClick} scanMode={scanMode} />
        <aside className="game-session__sidebar">
          <ClueLog state={state} />
          <Controls onMove={move} disabled={state.status !== 'playing'} />
        </aside>
      </div>
      {state.status === 'playing' && (
        <p className="game-session__hint-text" aria-live="polite">
          {flagMode && 'Flag mode: tap a tile to mark it as a suspected trap.'}
          {scanMode && 'Scan mode: tap an unvisited tile to reveal whether it is safe.'}
          {!flagMode && !scanMode && `Tile ${posKey(state.playerPos)} - use arrow keys, WASD, or tap an adjacent tile to move.`}
        </p>
      )}
    </div>
  );
}
