import { describe, expect, it } from "vitest";
import { generateProblem, stageForIndex } from "./problemGenerator";
import { digitAt, levelMax } from "./placeValue";
import { LEVELS, type Level } from "./types";

function columnSums(top: number, bottom: number, level: Level): number[] {
  const sums: number[] = [];
  for (let p = 0; p <= level; p++) sums.push(digitAt(top, p) + digitAt(bottom, p));
  return sums;
}

describe("generateProblem", () => {
  it("is deterministic in (level, seed, stage)", () => {
    for (const level of LEVELS) {
      const a = generateProblem(level, 12345, "mixed");
      const b = generateProblem(level, 12345, "mixed");
      expect(a).toEqual(b);
    }
  });

  it("always keeps operands within the level range and sums correctly", () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 400; seed++) {
        const p = generateProblem(level, seed, stageForIndex(seed % 6));
        expect(p.top).toBeGreaterThanOrEqual(0);
        expect(p.bottom).toBeGreaterThanOrEqual(0);
        expect(p.top).toBeLessThanOrEqual(levelMax(level));
        expect(p.bottom).toBeLessThanOrEqual(levelMax(level));
        expect(p.sum).toBe(p.top + p.bottom);
      }
    }
  });

  it("never produces a zero digit — every column of both operands holds 1..9", () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 400; seed++) {
        const p = generateProblem(level, seed, stageForIndex(seed % 6));
        for (let place = 0; place <= level; place++) {
          expect(digitAt(p.top, place)).toBeGreaterThanOrEqual(1);
          expect(digitAt(p.top, place)).toBeLessThanOrEqual(9);
          expect(digitAt(p.bottom, place)).toBeGreaterThanOrEqual(1);
          expect(digitAt(p.bottom, place)).toBeLessThanOrEqual(9);
        }
      }
    }
  });

  it("exercises the selected place (at least one operand reaches it)", () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 100; seed++) {
        const p = generateProblem(level, seed, "mixed");
        const usesPlace = digitAt(p.top, level) > 0 || digitAt(p.bottom, level) > 0;
        expect(usesPlace).toBe(true);
      }
    }
  });

  it("every generated exercise carries at least once (a column over ten)", () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 300; seed++) {
        for (const stage of ["orientation", "within-place", "one-exchange", "mixed"] as const) {
          const p = generateProblem(level, seed, stage);
          const carries = columnSums(p.top, p.bottom, level).filter((s) => s > 10).length;
          expect(carries).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("never carries in the leftmost column of a 4-digit exercise", () => {
    for (let seed = 0; seed < 400; seed++) {
      for (const stage of ["orientation", "within-place", "one-exchange", "mixed"] as const) {
        const p = generateProblem(3, seed, stage);
        // The thousands place is capped so that even a carry arriving from the
        // hundreds can never push it to ten — no fifth column ever appears.
        expect(digitAt(p.top, 3) + digitAt(p.bottom, 3)).toBeLessThanOrEqual(8);
      }
    }
  });

  it("one-exchange produces exactly one carrying column", () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 200; seed++) {
        const p = generateProblem(level, seed, "one-exchange");
        const carries = columnSums(p.top, p.bottom, level).filter((s) => s >= 10).length;
        expect(carries).toBe(1);
      }
    }
  });

  it("mixed always includes at least one carrying column", () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 200; seed++) {
        const p = generateProblem(level, seed, "mixed");
        const carries = columnSums(p.top, p.bottom, level).filter((s) => s >= 10).length;
        expect(carries).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("never lands a carrying column on exactly ten — carries always overflow past ten", () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 200; seed++) {
        for (const stage of ["one-exchange", "mixed"] as const) {
          const p = generateProblem(level, seed, stage);
          for (const s of columnSums(p.top, p.bottom, level)) {
            // A column either stays within a single frame (<= 9) or overflows it
            // (> 10); an exact ten would fill the tray with nothing left to bounce.
            expect(s === 10).toBe(false);
          }
        }
      }
    }
  });

  it("maps problem index to a difficulty stage", () => {
    expect(stageForIndex(0)).toBe("orientation");
    expect(stageForIndex(1)).toBe("within-place");
    expect(stageForIndex(2)).toBe("one-exchange");
    expect(stageForIndex(3)).toBe("mixed");
    expect(stageForIndex(9)).toBe("mixed");
  });
});
