/** Explains rules, controls, clue types, and scoring - shown on first visit and via the header button. */
import { Modal } from './Modal';
import { SCORING } from '../game/scoring';

export function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to Play Daily Dungeon" onClose={onClose}>
      <section>
        <h3>The goal</h3>
        <p>
          Escape the dungeon by reaching the exit 🚪 without stepping on a hidden trap 💀. Everyone gets the exact same
          dungeon each day, generated from today&rsquo;s date - so you can compare scores fairly with friends.
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
          <li>🪨 <strong>Environmental</strong> - cracked floor means a trap is adjacent.</li>
          <li>🧭 <strong>Directional</strong> - a trap lies somewhere in a given compass direction.</li>
          <li>🔗 <strong>Connection</strong> - two traps share the same corridor (row or column).</li>
        </ul>
        <p>Walking onto a clue tile reveals it automatically and adds it to your Clue Log - free to re-read any time.</p>
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
        <p>Your result also shows how your move count compares to the optimal (shortest possible safe) route.</p>
      </section>
      <section>
        <h3>Some days are harder</h3>
        <p>
          Dungeons grow larger and trickier later in the week, and some include a locked door 🔒 that needs a key 🔑 found
          elsewhere in the dungeon. Sundays are the toughest challenge of the week.
        </p>
      </section>
    </Modal>
  );
}
