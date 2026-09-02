import { createRng, type Rng } from "./rng";
import { fromDigits, levelMax } from "./placeValue";
import type { Level, Problem, Stage } from "./types";

interface PairOptions {
  regroup: boolean;
  /** Keep the top digit small to reduce early dragging effort. */
  smallTop?: boolean;
  /**
   * Cap the pair's sum so the column can never reach ten, even after a carry
   * arrives from the right. Used for the leftmost column of a 4-digit problem,
   * which must never spill into a fifth column.
   */
  capSum?: number;
}

/**
 * Generate a (topDigit, bottomDigit) pair for one column under constraints.
 * Both digits are always 1..9 — every tray on the board holds real blocks, so
 * no column ever renders empty.
 */
function columnPair(rng: Rng, opts: PairOptions): [number, number] {
  if (opts.regroup) {
    // a + b > 10 (strictly): the bottom tray fills to ten and compresses to a
    // single carry, so a carrying column always visibly carries rather than
    // merely filling up exactly. a is 2..9 (a = 1 could only reach ten), and b
    // is at least 11 - a, so both stay single digits.
    const a = rng.int(2, 9);
    const b = rng.int(11 - a, 9);
    return [a, b];
  }
  // No regrouping: a + b <= max, with both digits at least 1.
  const max = opts.capSum ?? 9;
  const topMax = opts.smallTop ? Math.min(4, max - 1) : max - 1; // leave room for b >= 1
  const a = rng.int(1, topMax);
  const b = rng.int(1, max - a);
  return [a, b];
}

/** Map a per-level problem index to a difficulty stage (plan §9). */
export function stageForIndex(index: number): Stage {
  if (index <= 0) return "orientation";
  if (index === 1) return "within-place";
  if (index === 2) return "one-exchange";
  return "mixed";
}

/**
 * Produce a reproducible pair of addends for `level` under a learning `stage`.
 * Deterministic in (level, seed, stage). The result may have one more digit
 * than the addends; callers must reserve a leading carry column.
 */
export function generateProblem(
  level: Level,
  seed: number,
  stage: Stage = "mixed",
): Problem {
  const rng = createRng(seed);
  const topDigits: number[] = [];
  const bottomDigits: number[] = [];

  // Every exercise carries at least once. Columns eligible to carry are all of
  // them, except the leftmost column of a 4-digit (thousands) problem: a carry
  // there would spill into a fifth column, which we never want. At smaller
  // levels the leftmost column may carry — that simply grows a new column on the
  // left, which the board lays out responsively.
  const topPlace = level;
  const cappedLeader = level === 3; // 4-digit: thousands place must never carry
  const carryEligible: number[] = [];
  for (let p = 0; p <= level; p++) {
    if (cappedLeader && p === topPlace) continue;
    carryEligible.push(p);
  }

  // At least one eligible column always carries. "mixed" may add more; the
  // gentler stages keep to the single guaranteed carry.
  const carrying = new Set<number>();
  carrying.add(carryEligible[rng.int(0, carryEligible.length - 1)]);
  if (stage === "mixed") {
    for (const p of carryEligible) {
      if (rng.next() < 0.45) carrying.add(p);
    }
  }

  for (let p = 0; p <= level; p++) {
    if (carrying.has(p)) {
      const [a, b] = columnPair(rng, { regroup: true });
      topDigits[p] = a;
      bottomDigits[p] = b;
      continue;
    }
    // A capped leader stays at eight or below so that even a carry arriving from
    // the column to its right can never push it to ten.
    const capSum = cappedLeader && p === topPlace ? 8 : undefined;
    const [a, b] = columnPair(rng, { regroup: false, smallTop: stage === "orientation", capSum });
    topDigits[p] = a;
    bottomDigits[p] = b;
  }

  const top = fromDigits(topDigits);
  const bottom = fromDigits(bottomDigits);
  const sum = top + bottom;

  // Invariants: both operands sit within the level range.
  const max = levelMax(level);
  if (top > max || bottom > max) {
    throw new Error(`Generated operand exceeds level range: ${top}, ${bottom} > ${max}`);
  }

  return { level, seed, top, bottom, sum };
}
