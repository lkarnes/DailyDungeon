/**
 * Deterministic seeded randomness.
 *
 * cyrb128 (string -> 128-bit hash) and sfc32 (fast, small, deterministic PRNG)
 * are well known public-domain algorithms. Using them lets every player who
 * loads the app on the same calendar day derive the exact same sequence of
 * "random" numbers from the same seed string, which is what makes the daily
 * dungeon identical for everyone.
 */

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number) {
  return function (): number {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** A deterministic pseudo-random number generator derived from a string seed. */
export class SeededRandom {
  private readonly rand: () => number;

  constructor(seed: string) {
    const [a, b, c, d] = cyrb128(seed);
    this.rand = sfc32(a, b, c, d);
    // Discard the first few outputs; the first values of sfc32 can be weakly
    // mixed immediately after seeding.
    for (let i = 0; i < 20; i++) this.rand();
  }

  /** Returns a float in [0, 1). */
  next(): number {
    return this.rand();
  }

  /** Returns an integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** Returns an integer in [min, max] inclusive. */
  intRange(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  /** Returns true with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Picks a random element from a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** Returns a new array with elements shuffled (Fisher-Yates). */
  shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
