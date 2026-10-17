export interface Rng {
  /** Returns float in [0, 1) */
  next(): number;
  /** Returns integer in [min, max] inclusive */
  nextInt(min: number, max: number): number;
  /** Picks one item from non-empty array */
  pick<T>(items: readonly T[]): T;
  getState(): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextInt(min: number, max: number): number {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)];
    },
    getState(): number {
      return state;
    },
  };
}
