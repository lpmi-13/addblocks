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
  it("fills the bottom to ten and bounces the overflow left", () => {
    const m = new LessonMachine(problem(8, 5)); // one column: top 8, bottom 5
    const r = m.pour(0);
    expect(r.ok).toBe(true);
    expect(r.poured).toBe(5); // filled the 5 empty slots
    expect(r.bounced).toBe(3); // 3 could not fit
    expect(r.to).toBe(1);
    expect(r.createdColumn).toBe(true);
    expect(m.column(0)).toEqual({ top: 0, bottom: 10 });
    expect(m.column(1)).toEqual({ top: 3, bottom: 0 });
    expect(m.columnCount).toBe(2);
  });

  it("pours cleanly with no bounce when everything fits", () => {
    const m = new LessonMachine(problem(3, 4));
    const r = m.pour(0);
    expect(r.poured).toBe(3);
    expect(r.bounced).toBe(0);
    expect(r.to).toBe(-1);
    expect(r.completed).toBe(true);
    expect(m.column(0)).toEqual({ top: 0, bottom: 7 });
  });

  it("bounced blocks can overflow the next top into a hovering pile", () => {
    const m = new LessonMachine(problem(99, 99));
    m.pour(0); // ones: 1 fits, 8 bounce → tens top becomes 9 + 8 = 17
    expect(m.column(1).top).toBe(17); // 10 in the frame, 7 hovering
  });

  it("conserves the total block count across a full combine", () => {
    const m = new LessonMachine(problem(99, 99));
    const start = m.totalBlocks();
    combineAll(m);
    expect(m.isComplete()).toBe(true);
    expect(m.totalBlocks()).toBe(start); // 36 blocks throughout
    for (let p = 0; p < m.columnCount; p++) expect(m.column(p).top).toBe(0);
  });

  it("grows new columns leftward as the cascade needs them", () => {
    const m = new LessonMachine(problem(99, 99));
    expect(m.columnCount).toBe(2);
    combineAll(m);
    expect(m.columnCount).toBeGreaterThan(2); // carried into hundreds (and beyond)
  });
});

describe("LessonMachine — single move", () => {
  it("drops one block into the bottom while there is room", () => {
    const m = new LessonMachine(problem(3, 4));
    const r = m.move(0);
    expect(r.poured).toBe(1);
    expect(r.bounced).toBe(0);
    expect(m.column(0)).toEqual({ top: 2, bottom: 5 });
  });

  it("bounces a single block once the bottom is full", () => {
    const m = new LessonMachine(problem(8, 5)); // bottom already at 5
    for (let i = 0; i < 5; i++) m.move(0); // fill bottom to 10
    expect(m.column(0)).toEqual({ top: 3, bottom: 10 });
    const r = m.move(0); // bottom full → bounce one
    expect(r.poured).toBe(0);
    expect(r.bounced).toBe(1);
    expect(m.column(1).top).toBe(1);
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
    expect(m.isComplete()).toBe(false); // column 1 still holds the bounced blocks
    m.pour(1);
    expect(m.isComplete()).toBe(true);
  });

  it("always terminates and conserves blocks for generated problems", () => {
    for (const level of LEVELS) {
      for (let s = 0; s < 40; s++) {
        const m = new LessonMachine(generateProblem(level, s, stageForIndex(s % 6)));
        const start = m.totalBlocks();
        combineAll(m);
        expect(m.isComplete()).toBe(true);
        expect(m.totalBlocks()).toBe(start);
      }
    }
  });
});
