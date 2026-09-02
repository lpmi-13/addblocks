import { describe, expect, it } from "vitest";
import { LessonMachine } from "./lessonMachine";
import { generateProblem, stageForIndex } from "./problemGenerator";
import { LEVELS, type Level, type Problem } from "./types";

function problem(top: number, bottom: number): Problem {
  const width = Math.max(String(top).length, String(bottom).length);
  const level = Math.min(3, Math.max(0, width - 1)) as Level;
  return { level, seed: 0, top, bottom, sum: top + bottom };
}

/** Pour every column, left to right, until nothing remains on top. */
function combineAll(m: LessonMachine): void {
  let guard = 0;
  while (!m.isComplete() && guard++ < 200) {
    for (let p = 0; p < m.columnCount; p++) {
      if (m.canPour(p)) m.pour(p);
    }
  }
}

describe("LessonMachine — pour", () => {
  it("fills the bottom to ten, compresses it, and carries a single block left", () => {
    const m = new LessonMachine(problem(8, 5)); // one column: top 8, bottom 5 → 13
    const r = m.pour(0);
    expect(r.ok).toBe(true);
    expect(r.poured).toBe(8); // the whole top stack fell in
    expect(r.filledTo).toBe(10); // the frame filled to ten before compressing
    expect(r.carried).toBe(1); // exactly one block carries, regardless of overflow
    expect(r.remainder).toBe(3); // 13 − 10 stays behind
    expect(r.to).toBe(1);
    expect(r.createdColumn).toBe(true);
    expect(m.column(0)).toEqual({ top: 0, bottom: 3 });
    expect(m.column(1)).toEqual({ top: 1, bottom: 0 });
    expect(m.columnCount).toBe(2);
  });

  it("pours cleanly with no carry when the frame stays under ten", () => {
    const m = new LessonMachine(problem(3, 4));
    const r = m.pour(0);
    expect(r.poured).toBe(3);
    expect(r.carried).toBe(0);
    expect(r.remainder).toBe(7);
    expect(r.to).toBe(-1);
    expect(r.completed).toBe(true);
    expect(m.column(0)).toEqual({ top: 0, bottom: 7 });
  });

  it("carries exactly one no matter how far past ten the column summed", () => {
    const m = new LessonMachine(problem(99, 99));
    m.pour(0); // ones: 9 + 9 = 18 → remainder 8, a single block carries to the tens
    expect(m.column(0)).toEqual({ top: 0, bottom: 8 });
    expect(m.column(1).top).toBe(10); // the tens top was 9, plus the one carry
  });

  it("preserves the represented place-value total across a full combine", () => {
    const m = new LessonMachine(problem(99, 99));
    expect(m.representedValue()).toBe(198);
    combineAll(m);
    expect(m.isComplete()).toBe(true);
    expect(m.representedValue()).toBe(198); // 99 + 99, conserved by the compression
    for (let p = 0; p < m.columnCount; p++) expect(m.column(p).top).toBe(0);
  });

  it("grows new columns leftward as the cascade needs them", () => {
    const m = new LessonMachine(problem(99, 99));
    expect(m.columnCount).toBe(2);
    combineAll(m);
    expect(m.columnCount).toBeGreaterThan(2); // carried into hundreds
  });
});

describe("LessonMachine — undo & completion", () => {
  it("reverses a pour, including a column it created", () => {
    const m = new LessonMachine(problem(8, 5));
    const before = m.snapshotColumns();
    m.pour(0);
    expect(m.columnCount).toBe(2);
    m.undo();
    expect(m.columnCount).toBe(1); // the created column was dropped
    expect(m.snapshotColumns()).toEqual(before);
  });

  it("completes exactly when every top stack is empty", () => {
    const m = new LessonMachine(problem(8, 5));
    m.pour(0);
    expect(m.isComplete()).toBe(false); // column 1 still holds the carried block
    m.pour(1);
    expect(m.isComplete()).toBe(true);
  });

  it("always terminates and preserves the total for generated problems", () => {
    for (const level of LEVELS) {
      for (let s = 0; s < 40; s++) {
        const p = generateProblem(level, s, stageForIndex(s % 6));
        const m = new LessonMachine(p);
        expect(m.representedValue()).toBe(p.sum);
        combineAll(m);
        expect(m.isComplete()).toBe(true);
        expect(m.representedValue()).toBe(p.sum);
      }
    }
  });

  it("never grows a fifth column for a 4-digit problem", () => {
    for (let s = 0; s < 200; s++) {
      const p = generateProblem(3, s, stageForIndex(s % 6));
      const m = new LessonMachine(p);
      combineAll(m);
      expect(m.isComplete()).toBe(true);
      expect(m.columnCount).toBe(4); // the thousands column never carries out
    }
  });
});
