import { CELLS_PER_TRAY, digitAt, numDigits } from "./placeValue";
import type { Problem } from "./types";

export type Phase =
  | "combining" // blocks visible, learner is pouring stacks
  | "complete"; // every top stack has been emptied

/**
 * Canonical per-column state.
 *
 * `top` is the stack the learner pours downward: its place digit, plus one for
 * any carry dropped in from the column to the right. `bottom` is the destination
 * and always rests below ten — when a pour would fill it to ten, that full frame
 * compresses into a single carry block and the remainder (0..9) stays behind.
 */
export interface Column {
  top: number;
  bottom: number;
}

/** One undoable action. */
type Op = {
  kind: "pour";
  from: number;
  prevTop: number;
  prevBottom: number;
  carried: number;
  createdColumn: boolean;
};

/** Result of a pour, so the UI can animate/announce. */
export interface MoveResult {
  ok: boolean;
  /** Column that was acted on. */
  from: number;
  /** Blocks that fell from the top stack into this column's bottom tray. */
  poured: number;
  /** Bottom fill before the pour. */
  bottomBefore: number;
  /** Peak bottom fill during the pour — ten when the frame filled and carried. */
  filledTo: number;
  /** Bottom fill left after any carry compressed away (this place's digit). */
  remainder: number;
  /** 1 when a full ten compressed into a single block that carried left, else 0. */
  carried: number;
  /** Target column of the carry, or -1 when nothing carried. */
  to: number;
  /** True when the carry spilled into a freshly created leftmost column. */
  createdColumn: boolean;
  completed: boolean;
  reason?: "no-piece" | "wrong-phase";
}

export class LessonMachine {
  readonly problem: Problem;
  /** Number of place columns currently on the board (grows leftward on carry). */
  columnCount: number;
  private columns: Column[];
  private history: Op[] = [];
  private _phase: Phase = "combining";
  /** Place currently selected via tap/keyboard, or null. */
  selectedPlace: number | null = null;

  constructor(problem: Problem) {
    this.problem = problem;
    const width = Math.max(numDigits(problem.top), numDigits(problem.bottom));
    this.columnCount = width;
    this.columns = [];
    for (let p = 0; p < this.columnCount; p++) {
      this.columns.push({ top: digitAt(problem.top, p), bottom: digitAt(problem.bottom, p) });
    }
    this.checkComplete();
  }

  get phase(): Phase {
    return this._phase;
  }

  isComplete(): boolean {
    return this._phase === "complete";
  }

  /** Highest place index either addend actually uses (for hiding blank leaders). */
  get significantColumns(): number {
    return Math.max(numDigits(this.problem.top), numDigits(this.problem.bottom));
  }

  column(place: number): Column {
    return this.columns[place];
  }

  snapshotColumns(): Column[] {
    return this.columns.map((c) => ({ ...c }));
  }

  canPour(place: number): boolean {
    return this._phase === "combining" && (this.columns[place]?.top ?? 0) > 0;
  }

  /** Alias kept for the "Move down" control, which pours the whole stack. */
  canMove(place: number): boolean {
    return this.canPour(place);
  }

  private ensureColumn(place: number): boolean {
    if (place < this.columnCount) return false;
    while (this.columnCount <= place) {
      this.columns.push({ top: 0, bottom: 0 });
      this.columnCount += 1;
    }
    return true;
  }

  /**
   * Pour a whole top stack down into this column's bottom tray. If the tray fills
   * to ten, the full ten compress into a single block that carries left into the
   * next column's top; only the remainder (combined − 10) stays in the bottom.
   * The carry is always one — a place can hold at most a single ten regardless of
   * how far past ten the two digits summed.
   */
  pour(place: number): MoveResult {
    if (this._phase !== "combining") {
      return this.fail(place, "wrong-phase");
    }
    const col = this.columns[place];
    if (!col || col.top <= 0) return this.fail(place, "no-piece");

    const bottomBefore = col.bottom;
    const poured = col.top;
    const combined = col.top + col.bottom;
    col.top = 0;
    const filledTo = Math.min(combined, CELLS_PER_TRAY);

    let carried = 0;
    let to = -1;
    let createdColumn = false;
    if (combined >= CELLS_PER_TRAY) {
      // The frame fills to ten and compresses to a single carry block.
      carried = 1;
      col.bottom = combined - CELLS_PER_TRAY;
      to = place + 1;
      createdColumn = this.ensureColumn(to);
      this.columns[to].top += 1;
    } else {
      col.bottom = combined;
    }

    this.history.push({ kind: "pour", from: place, prevTop: poured, prevBottom: bottomBefore, carried, createdColumn });
    const completed = this.checkComplete();
    return {
      ok: true,
      from: place,
      poured,
      bottomBefore,
      filledTo,
      remainder: col.bottom,
      carried,
      to,
      createdColumn,
      completed,
    };
  }

  private fail(place: number, reason: "no-piece" | "wrong-phase"): MoveResult {
    return {
      ok: false,
      from: place,
      poured: 0,
      bottomBefore: 0,
      filledTo: 0,
      remainder: 0,
      carried: 0,
      to: -1,
      createdColumn: false,
      completed: false,
      reason,
    };
  }

  /** Reverse the most recent action. */
  undo(): Op | null {
    const op = this.history.pop();
    if (!op) return null;
    const col = this.columns[op.from];
    col.top = op.prevTop;
    col.bottom = op.prevBottom;
    if (op.carried > 0) this.columns[op.from + 1].top -= op.carried;
    if (op.createdColumn) this.dropEmptyTrailingColumns();
    if (this._phase === "complete") this._phase = "combining";
    return op;
  }

  private dropEmptyTrailingColumns(): void {
    while (
      this.columnCount > this.significantColumns &&
      this.columns[this.columnCount - 1].top === 0 &&
      this.columns[this.columnCount - 1].bottom === 0
    ) {
      this.columns.pop();
      this.columnCount -= 1;
    }
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  moveCount(): number {
    return this.history.length;
  }

  private checkComplete(): boolean {
    const done = this.columns.every((c) => c.top === 0);
    if (done) this._phase = "complete";
    return done;
  }

  /**
   * The place-value total the board currently represents. Compressing a full ten
   * into one carry block preserves it, so this stays equal to `problem.sum` from
   * the first blocks laid down through to completion.
   */
  representedValue(): number {
    let value = 0;
    for (let p = 0; p < this.columns.length; p++) {
      value += (this.columns[p].top + this.columns[p].bottom) * Math.pow(10, p);
    }
    return value;
  }
}
