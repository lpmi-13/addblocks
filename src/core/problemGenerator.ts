import { createRng, type Rng } from "./rng";
import { fromDigits, levelMax } from "./placeValue";
import type { Level, Problem, Stage } from "./types";

interface PairOptions {
  regroup: boolean;
  /** Keep the top digit small to reduce early dragging effort. */
  smallTop?: boolean;
}

/**
 * Generate a (topDigit, bottomDigit) pair for one column under constraints.
 * Both digits are always 1..9 — every tray on the board holds real blocks, so
 * no column ever renders empty.
 */
function columnPair(rng: Rng, opts: PairOptions): [number, number] {
  if (opts.regroup) {
    // a + b >= 10, both single digits (b is at least 1 since 10 - a >= 1).
    const a = rng.int(1, 9);
    const b = rng.int(10 - a, 9);
    return [a, b];
  }
  // No regrouping: a + b <= 9, with both digits at least 1.
  const topMax = opts.smallTop ? 4 : 8; // leave room for b >= 1
  const a = rng.int(1, topMax);
  const b = rng.int(1, 9 - a);
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

  // For "one-exchange", pick a single column that will carry.
  const exchangeColumn = stage === "one-exchange" ? rng.int(0, level) : -1;

  // For "mixed", decide per column whether it regroups; ensure at least one.
  let mixedRegroup: boolean[] = [];
  if (stage === "mixed") {
    mixedRegroup = Array.from({ length: level + 1 }, () => rng.next() < 0.4);
    if (!mixedRegroup.some(Boolean)) {
      mixedRegroup[rng.int(0, level)] = true;
    }
  }

  for (let p = 0; p <= level; p++) {
    let regroup = false;
    switch (stage) {
      case "orientation":
      case "within-place":
        regroup = false;
        break;
      case "one-exchange":
        regroup = p === exchangeColumn;
        break;
      case "mixed":
        regroup = mixedRegroup[p];
        break;
    }

    const [a, b] = columnPair(rng, {
      regroup,
      smallTop: stage === "orientation",
    });
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
