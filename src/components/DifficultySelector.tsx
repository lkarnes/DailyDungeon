/** Lets the player choose which difficulty to play today - never forced by the day of the week. */
import { DIFFICULTY_NAMES, DIFFICULTY_PRESETS, type DifficultyName } from '../game/seed';

interface DifficultySelectorProps {
  selected: DifficultyName;
  onSelect: (name: DifficultyName) => void;
  /** Marks tiers already completed today with a checkmark. */
  completedNames?: DifficultyName[];
}

export function DifficultySelector({ selected, onSelect, completedNames = [] }: DifficultySelectorProps) {
  return (
    <div className="difficulty-selector" role="radiogroup" aria-label="Choose difficulty">
      {DIFFICULTY_NAMES.map((name) => {
        const isSelected = name === selected;
        const isCompleted = completedNames.includes(name);
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`difficulty-selector__btn ${isSelected ? 'difficulty-selector__btn--active' : ''}`}
            onClick={() => onSelect(name)}
            title={`${name} - ${DIFFICULTY_PRESETS[name].rows}x${DIFFICULTY_PRESETS[name].cols} grid`}
          >
            {name}
            {isCompleted && <span className="difficulty-selector__check">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
