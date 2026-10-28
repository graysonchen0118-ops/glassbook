// Seeded random numbers, so every visit builds the same book.
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(r: () => number, arr: readonly T[]) => arr[Math.floor(r() * arr.length)];

export const SEC = 1000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

const HEX = "0123456789abcdef";
export function hex(r: () => number, n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += HEX[Math.floor(r() * 16)];
  return s;
}
export const address = (r: () => number) => `0x${hex(r, 40)}`;
