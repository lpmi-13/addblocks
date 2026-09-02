import { CELLS_PER_TRAY, digitAt, numDigits } from "./placeValue";
import type { Problem } from "./types";

export type Phase =
  | "combining" // blocks visible, learner is pouring stacks
  | "complete"; // every top stack has been emptied

/**
 * Canonical per-column state.
 *
 * `top` is the stack the learner pours downward. It is not capped: blocks that
 * bounce in from the column to the right can push it past a full frame, and the
 * overflow is drawn hovering above the frame until the column is poured.
 * `bottom` is the destination and holds at most ten (a full frame).
 */
export interface Column {
  top: number;
  bottom: number;
}

/** One undoable action. */
type Op =
  | { kind: "pour"; from: number; poured: number; bounced: number; createdColumn: boolean }
  | { kind: "move"; from: number; toBottom: boolean; createdColumn: boolean };

/** Result of pouring or moving, so the UI can animate/announce. */
export interface MoveResult {
  ok: boolean;
  /** Column that was acted on. */
  from: number;
  /** Blocks that dropped into this column's bottom tray. */
  poured: number;
  /** Blocks that bounced left into the next column's top tray. */
  bounced: number;
  /** Target column of the bounce, or -1 when nothing bounced. */
  to: number;
  /** True when the bounce spilled into a freshly created leftmost column. */
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

  /** Alias kept for the single-step control. */
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
   * Pour a whole top stack downward: it fills this column's bottom up to ten,
   * and any remainder bounces left into the next column's top stack.
   */
  pour(place: number): MoveResult {
    if (this._phase !== "combining") {
      return this.fail(place, "wrong-phase");
    }
    const col = this.columns[place];
    if (!col || col.top <= 0) return this.fail(place, "no-piece");

    const space = CELLS_PER_TRAY - col.bottom;
    const poured = Math.min(col.top, space);
    col.bottom += poured;
    const bounced = col.top - poured;
    col.top = 0;

    let to = -1;
    let createdColumn = false;
    if (bounced > 0) {
      to = place + 1;
      createdColumn = this.ensureColumn(to);
      this.columns[to].top += bounced;
    }

    this.history.push({ kind: "pour", from: place, poured, bounced, createdColumn });
    const completed = this.checkComplete();
    return { ok: true, from: place, poured, bounced, to, createdColumn, completed };
  }

  /** Move a single block down (fine control / keyboard), bouncing if the bottom is full. */
  move(place: number): MoveResult {
    if (this._phase !== "combining") {
      return this.fail(place, "wrong-phase");
    }
    const col = this.columns[place];
    if (!col || col.top <= 0) return this.fail(place, "no-piece");

    let poured = 0;
    let bounced = 0;
    let to = -1;
    let createdColumn = false;
    if (col.bottom < CELLS_PER_TRAY) {
      col.top -= 1;
      col.bottom += 1;
      poured = 1;
    } else {
      to = place + 1;
      createdColumn = this.ensureColumn(to);
      col.top -= 1;
      this.columns[to].top += 1;
      bounced = 1;
    }

    this.history.push({ kind: "move", from: place, toBottom: poured === 1, createdColumn });
    const completed = this.checkComplete();
    return { ok: true, from: place, poured, bounced, to, createdColumn, completed };
  }

  private fail(place: number, reason: "no-piece" | "wrong-phase"): MoveResult {
    return { ok: false, from: place, poured: 0, bounced: 0, to: -1, createdColumn: false, completed: false, reason };
  }

  /** Reverse the most recent action. */
  undo(): Op | null {
    const op = this.history.pop();
    if (!op) return null;
    if (op.kind === "pour") {
      const col = this.columns[op.from];
      col.bottom -= op.poured;
      col.top = op.poured + op.bounced;
      if (op.bounced > 0) this.columns[op.from + 1].top -= op.bounced;
    } else {
      const col = this.columns[op.from];
      if (op.toBottom) {
        col.bottom -= 1;
        col.top += 1;
      } else {
        this.columns[op.from + 1].top -= 1;
        col.top += 1;
      }
    }
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

  /** Total number of blocks on the board — conserved across every action. */
  totalBlocks(): number {
    let total = 0;
    for (const c of this.columns) total += c.top + c.bottom;
    return total;
  }
}
