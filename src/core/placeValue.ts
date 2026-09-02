import type { Level } from "./types";

export const CELLS_PER_TRAY = 10;

/** Human names for each place index, 0 = ones. Index 5 covers the carry column. */
export const PLACE_NAMES = [
  "ones",
  "tens",
  "hundreds",
  "thousands",
  "ten-thousands",
  "hundred-thousands",
] as const;

/** Symbolic column labels for the addition view. */
export const PLACE_LABELS = ["1", "10", "100", "1,000", "10,000", "100,000"] as const;

/** Safe place name for any index (falls back for unexpected places). */
export function placeName(place: number): string {
  return PLACE_NAMES[place] ?? `place ${place}`;
}

/** Safe symbolic label for any place index. */
export function placeLabel(place: number): string {
  return PLACE_LABELS[place] ?? String(Math.pow(10, place));
}

/** Short name for the level selector, e.g. "Hundreds". */
export function levelTitle(level: Level): string {
  const name = PLACE_NAMES[level];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Sample range shown on a level card, e.g. "0–999". */
export function levelRange(level: Level): string {
  const max = Math.pow(10, level + 1) - 1;
  return `0–${formatNumber(max)}`;
}

/** Largest operand allowed at a level (inclusive). */
export function levelMax(level: Level): number {
  return Math.pow(10, level + 1) - 1;
}

/**
 * Decompose a non-negative integer into digits indexed by place.
 * Index 0 is the ones place. `digits(0)` is `[0]`; there are no leading zeros
 * beyond the natural length of the number.
 */
export function digits(n: number): number[] {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`digits() expects a non-negative integer, got ${n}`);
  }
  if (n === 0) return [0];
  const out: number[] = [];
  let v = n;
  while (v > 0) {
    out.push(v % 10);
    v = Math.floor(v / 10);
  }
  return out;
}

/** Recompose digits (index 0 = ones) back into an integer. */
export function fromDigits(d: readonly number[]): number {
  let total = 0;
  for (let i = d.length - 1; i >= 0; i--) {
    total = total * 10 + d[i];
  }
  return total;
}

/** The digit at a given place, or 0 if the number does not reach that place. */
export function digitAt(n: number, place: number): number {
  return Math.floor(n / Math.pow(10, place)) % 10;
}

/** Number of digits (columns) in a number; `numDigits(0)` is 1. */
export function numDigits(n: number): number {
  return digits(n).length;
}

/** Format with thousands separators using tabular-friendly grouping. */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
