/** Max place index the learner is practising. 0 = ones ... 3 = thousands. */
export type Level = 0 | 1 | 2 | 3;

export const LEVELS: Level[] = [0, 1, 2, 3];

/** A generated, reproducible addition problem. */
export interface Problem {
  level: Level;
  seed: number;
  top: number;
  bottom: number;
  /** Independently verifiable expected result. */
  sum: number;
}

/** Difficulty staging for problem generation (see plan §9). */
export type Stage = "orientation" | "within-place" | "one-exchange" | "mixed";
