/** Explains rules, controls, clue types, and scoring - shown on first visit and via the header button. */
import { Modal } from './Modal';
import { SCORING } from '../game/scoring';

export function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to Play Daily Dungeon" onClose={onClose}>
      <section>
        <h3>The goal</h3>
        <p>
          Escape the dungeon by reaching the exit 🚪 without stepping on a hidden trap 💀. Everyone who picks the same
          difficulty on the same day gets the exact same dungeon - so you can compare scores fairly with friends.
        </p>
      </section>
      <section>
        <h3>Choose your difficulty</h3>
        <p>
          Pick Easy, Medium, Hard, or Treacherous any day - it&rsquo;s never forced by the calendar. Your attempt is
          tracked separately for each difficulty, so you can play more than one tier the same day if you like.
        </p>
      </section>
      <section>
        <h3>Controls</h3>
        <ul>
          <li>Move with the arrow buttons, the arrow keys, or WASD.</li>
          <li>Click/tap an adjacent floor tile to step onto it.</li>
          <li>There&rsquo;s no time pressure - take as long as you like to think.</li>
        </ul>
      </section>
      <section>
        <h3>Clues</h3>
        <p>Every trap can be logically identified from the clues scattered around the dungeon. You never have to guess blindly:</p>
        <ul>
          <li>🔢 <strong>Numerical</strong> - exactly how many traps are in the 8 surrounding tiles.</li>
          <li>🎯 <strong>Specific</strong> - pinpoints one exact trap location.</li>
          <li>📍 <strong>Proximity</strong> - a trap is within a certain number of tiles.</li>
          <li>🕸️ <strong>Environmental</strong> - cracked floor means a trap is adjacent.</li>
          <li>🧭 <strong>Directional</strong> - a trap lies somewhere in a given compass direction.</li>
          <li>🔗 <strong>Connection</strong> - two traps share the same corridor (row or column).</li>
          <li>🕹️ <strong>Lever</strong> - points you toward a hidden switch that clears a blocked passage.</li>
        </ul>
        <p>
          Clues are hidden until you actually stand on their tile - the dungeon map doesn&rsquo;t show you where they are in
          advance. Walking onto a clue tile reveals it and adds it to your Clue Log, where you can re-read it any time.
        </p>
      </section>
      <section>
        <h3>Obstacles</h3>
        <ul>
          <li>🔒 <strong>Locked door</strong> - opens permanently once you&rsquo;ve found its key 🔑 elsewhere in the dungeon.</li>
          <li>
            🪨 <strong>Rubble-blocked passage</strong> - cleared permanently once you find its hidden lever 🕹️ (a lever clue
            always points the way).
          </li>
          <li>⛔ <strong>Impassable rubble</strong> - a permanent dead end. No key, lever, or trick ever opens these.</li>
        </ul>
      </section>
      <section>
        <h3>Tools (free actions)</h3>
        <ul>
          <li>🚩 <strong>Mark Trap</strong> - flag a tile you suspect is dangerous. Purely for your own bookkeeping.</li>
          <li>
            🔦 <strong>Scan</strong> - reveals whether one specific tile is safe or a trap. Costs {Math.abs(SCORING.PER_HINT)} points and
            removes the no-hints bonus. Limited uses per run.
          </li>
        </ul>
      </section>
      <section>
        <h3>Scoring</h3>
        <ul>
          <li>Escape the dungeon: +{SCORING.BASE_COMPLETE}</li>
          <li>Each move: {SCORING.PER_MOVE}</li>
          <li>Each clue discovered: +{SCORING.PER_CLUE}</li>
          <li>Each treasure found: +{SCORING.PER_COLLECTIBLE}</li>
          <li>Complete without using a scan: +{SCORING.NO_HINTS_BONUS}</li>
        </ul>
        <p>
          Your result also shows how your move count compares to the optimal (shortest possible safe) route, plus how long
          you took - time is tracked for bragging rights only and never affects your score. You also earn a badge based on
          how clean your run was: 👑 Perfect Run (optimal moves, every treasure, no hints), 🏆 Flawless Route (optimal
          moves, no hints), 🥇 Great, 🥈 Good, or 🥉 Escaped.
        </p>
      </section>
      <section>
        <h3>Harder tiers</h3>
        <p>
          Higher difficulties use larger grids with more traps, more hidden levers, and more permanently blocked
          passages to route around - Treacherous is the toughest tier available.
        </p>
      </section>
    </Modal>
  );
}
