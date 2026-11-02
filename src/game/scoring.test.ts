import { describe, expect, it } from 'vitest';
import { computeScore } from './scoring';

describe('computeScore', () => {
  it('gives partial credit for a failed run', () => {
    const score = computeScore({ completed: false, movesUsed: 10, cluesDiscovered: 3, collectiblesFound: 1, hintsUsed: 0 });
    expect(score).toBe(3 * 25 + 50 + 10 * 2);
  });

  it('gives a failed run with no progress zero', () => {
    expect(computeScore({ completed: false, movesUsed: 0, cluesDiscovered: 0, collectiblesFound: 0, hintsUsed: 0 })).toBe(0);
  });

  it('scores a failed run below a comparable escape', () => {
    const base = { movesUsed: 10, cluesDiscovered: 3, collectiblesFound: 1, hintsUsed: 0 };
    expect(computeScore({ ...base, completed: false })).toBeLessThan(computeScore({ ...base, completed: true }));
  });
});
