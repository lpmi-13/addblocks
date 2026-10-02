import { h, clear } from "./dom";
import { announce } from "../announce";
import { playCue } from "../sound";
import { CELLS_PER_TRAY, formatNumber, levelTitle, placeLabel, placeName } from "../core/placeValue";
import type { Column, LessonMachine, MoveResult } from "../core/lessonMachine";
import type { Preferences } from "../preferences";

const DRAG_THRESHOLD = 6; // px before a press becomes a drag rather than a tap
const DROP_PADDING = 30; // px of forgiveness around a drop target
const POUR_MS = 340;
const SLIDE_MS = 220; // whole-stack glide from the release point into the bottom tray
const BOUNCE_MS = 560;
const GATHER_MS = 520; // a full ten lifting toward the viewer and drawing together
const MERGE_MS = 220; // the gathered ten fusing into one carry block
const DRIFT_MS = 380; // leftovers above a carried ten settling down into the frame
const LIFT_SCALE = 1.45; // how far toward the viewer the ten swell before merging

interface Handlers {
  onChangeLevel: () => void;
  onNext: () => void;
  /** Generate a fresh challenge at the current level. */
  onNew: () => void;
}

type FocusKey = string;

export class ProblemView {
  private root: HTMLElement;
  private machine: LessonMachine;
  private prefs: Preferences;
  private handlers: Handlers;

  private screenEl!: HTMLElement;
  private boardEl!: HTMLElement;
  private controlsEl!: HTMLElement;
  private promptEl!: HTMLElement;
  private resultEl!: HTMLElement;

  private topTrays: (HTMLElement | null)[] = [];
  private bottomTrays: (HTMLElement | null)[] = [];

  private animating = false;
  /** Blocks past a full ten, held stacked above the frame while the carry plays. */
  private leftovers: HTMLElement[] = [];
  private timers: number[] = [];
  private pendingFocus: FocusKey | null = null;
  private invalidStreak = 0;
  /** Column whose pour is mid-animation; its total waits until it lands. */
  private pouringPlace: number | null = null;
  /** Columns whose totals were on screen at the last render. */
  private shownSums = new Set<number>();

  private activePointerId: number | null = null;
  private drag: {
    place: number;
    /** Wrapper holding one movable layer per filled top column. */
    ghost: HTMLElement | null;
    /** Per-column layers; each stops on its own column's pile. */
    cols: { el: HTMLElement; maxDy: number }[];
    originTray: HTMLElement;
    startX: number;
    startY: number;
    moved: boolean;
    /** Downward travel (px) at which the *last* column lands and the stack pours. */
    maxDy: number;
  } | null = null;

  private readonly onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private readonly onPointerUp = (e: PointerEvent) => this.handlePointerUp(e);
  private readonly onPointerCancel = (e: PointerEvent) => this.handlePointerCancel(e);
  private readonly onWindowResize = () => this.cancelActiveManipulation();

  constructor(root: HTMLElement, machine: LessonMachine, prefs: Preferences, handlers: Handlers) {
    this.root = root;
    this.machine = machine;
    this.prefs = prefs;
    this.handlers = handlers;
  }

  /* ------------------------------------------------------------------ mount */

  mount(): void {
    clear(this.root);

    this.promptEl = h("p", { class: "prompt", attrs: { role: "status", "aria-live": "off" } });
    this.boardEl = h("div", { class: "board", attrs: { role: "group" } });
    this.controlsEl = h("div", { class: "controls" });
    this.resultEl = h("div", { class: "result", attrs: { hidden: true } });

    const scroll = h("div", { class: "board-scroll" }, [this.boardEl]);

    this.screenEl = h("section", { class: "screen screen--problem", attrs: { id: "main" } }, [
      h("header", { class: "problem-head" }, [
        h(
          "button",
          {
            class: "btn btn--ghost",
            type: "button",
            attrs: { "aria-label": "Change level" },
            on: { click: () => this.handlers.onChangeLevel() },
          },
          [h("span", { text: "‹ Levels" })],
        ),
        h("h1", {
          class: "problem-head__title",
          text: `${levelTitle(this.machine.problem.level)} · Add the blocks`,
        }),
        h("span", {
          class: "problem-head__eq",
          attrs: { "aria-hidden": "true" },
          text: this.equationText(),
        }),
      ]),
      this.promptEl,
      scroll,
      this.resultEl,
      this.controlsEl,
    ]);

    this.screenEl.dataset.phase = this.machine.phase;
    if (this.prefs.reducedMotion) this.screenEl.classList.add("reduced-motion");

    this.boardEl.addEventListener("pointerdown", (e) => this.handlePointerDown(e));
    this.root.append(this.screenEl);

    this.pendingFocus = this.firstMovableFocus();
    this.renderBoard();
    this.renderControls();
    this.updatePrompt();

    if (this.machine.isComplete()) {
      this.showCompletion();
    } else {
      announce(
        `${this.spokenAddends()} Drag each top stack down into its tray. When a frame fills to ten it carries one block to the next column on the left.`,
      );
    }
  }

  destroy(): void {
    this.cancelActiveManipulation();
    this.clearTimers();
    this.clearLeftovers();
    this.detachWindowListeners();
  }

  setPreferences(prefs: Preferences): void {
    this.prefs = prefs;
    this.screenEl.classList.toggle("reduced-motion", prefs.reducedMotion);
    this.renderBoard();
    this.renderControls();
  }

  /* --------------------------------------------------------------- rendering */

  private renderBoard(visual?: Column[]): void {
    const cols = visual ?? this.machine.snapshotColumns();
    const count = this.machine.columnCount;
    clear(this.boardEl);
    this.topTrays = new Array(count).fill(null);
    this.bottomTrays = new Array(count).fill(null);

    this.boardEl.classList.toggle("board--numbered", this.prefs.showNumbers);
    this.boardEl.style.gridTemplateColumns = `minmax(2.2rem, auto) repeat(${count}, auto)`;
    // Drives the responsive cell size so more columns (a carry can grow a fourth)
    // shrink the blocks to fit the viewport rather than overflowing it.
    this.boardEl.style.setProperty("--cols", String(count));

    // Row 1: place labels.
    this.boardEl.append(this.gridCell(1, 1, h("span", { class: "corner", attrs: { "aria-hidden": "true" } })));
    for (let p = count - 1; p >= 0; p--) {
      const gridCol = count + 1 - p;
      const cell = this.gridCell(1, gridCol, h("span", { class: "col-label", text: placeLabel(p) }));
      cell.dataset.place = String(p);
      cell.classList.add("cell-label");
      this.boardEl.append(cell);
    }

    // Operator gutter, aligned with the bottom addend row.
    this.boardEl.append(
      this.gridCell(3, 1, h("span", { class: "operator", text: "+", attrs: { "aria-hidden": "true" } })),
    );

    for (let p = count - 1; p >= 0; p--) {
      const gridCol = count + 1 - p;
      const col = cols[p];
      this.boardEl.append(this.addendCell(2, gridCol, p, col, "top"));
      this.boardEl.append(this.addendCell(3, gridCol, p, col, "bottom"));
    }

    // Rule line spanning all number columns.
    const rule = this.gridCell(4, 1, h("span", {}));
    rule.style.gridColumn = `1 / span ${count + 1}`;
    rule.classList.add("rule");
    this.boardEl.append(rule);

    // Total each column beneath the rule once it has been poured. While a pour is
    // still animating (`visual`), hold that column's total back until it settles.
    const shown = new Set<number>();
    for (let p = count - 1; p >= 0; p--) {
      if (!this.machine.isSettled(p) || p === this.pouringPlace) continue;
      const sum = h("span", { class: "col-sum", text: String(cols[p].bottom) });
      // Only animate totals that are newly appearing, not ones redrawn by a re-render.
      if (!this.shownSums.has(p)) sum.classList.add("col-sum--new");
      const cell = this.gridCell(5, count + 1 - p, sum);
      cell.dataset.place = String(p);
      cell.classList.add("sum-cell");
      this.boardEl.append(cell);
      shown.add(p);
    }
    this.shownSums = shown;

    this.applyTargetHighlight();
    this.restorePendingFocus();
  }

  private gridCell(row: number, col: number, child: HTMLElement): HTMLElement {
    const cell = h("div", { class: "grid-cell" }, [child]);
    cell.style.gridRow = String(row);
    cell.style.gridColumn = String(col);
    return cell;
  }

  private addendCell(row: number, gridCol: number, place: number, col: Column, which: "top" | "bottom"): HTMLElement {
    const count = which === "top" ? col.top : col.bottom;
    const children: HTMLElement[] = [];

    const caption = this.prefs.showNumbers
      ? h("span", { class: "stack__num", attrs: { "aria-hidden": "true" }, text: count > 0 ? String(count) : " " })
      : null;

    if (which === "top") {
      if (caption) children.push(caption);
      if (count > CELLS_PER_TRAY) children.push(this.hoverBlocks(count - CELLS_PER_TRAY));
      children.push(this.buildTray(place, which, count, col));
    } else {
      children.push(this.buildTray(place, which, count, col));
      if (caption) children.push(caption);
    }

    const stack = h("div", { class: `stack stack--${which}` }, children);
    const cell = this.gridCell(row, gridCol, stack);
    cell.dataset.place = String(place);
    cell.classList.add("addend-cell", `addend-cell--${which}`);
    return cell;
  }

  /** Blocks that spilled past a full top frame, drawn hovering above it. */
  private hoverBlocks(extra: number): HTMLElement {
    const cells: HTMLElement[] = [];
    for (let i = 0; i < extra; i++) cells.push(h("div", { class: "cell cell--filled cell--hover", attrs: { "aria-hidden": "true" } }));
    return h("div", { class: "hover-blocks", attrs: { "aria-hidden": "true" } }, cells);
  }

  private buildTray(place: number, which: "top" | "bottom", filled: number, col: Column): HTMLElement {
    const isTop = which === "top";
    const name = placeName(place);
    const cells: HTMLElement[] = [];
    for (let position = 0; position < CELLS_PER_TRAY; position++) {
      const order = this.fillOrder(which, position);
      const isFilled = order < filled;
      let cls = "cell";
      cls += isFilled ? " cell--filled" : " cell--empty";
      if (isTop && isFilled) cls += " cell--piece";
      const cell = h("div", { class: cls, attrs: { "aria-hidden": "true" } });
      cell.dataset.order = String(order);
      if (isTop && isFilled) {
        cell.dataset.place = String(place);
        cell.dataset.piece = "1";
      }
      cells.push(cell);
    }

    const grid = h("div", { class: "ten-frame" }, cells);

    const selected = this.machine.selectedPlace === place;
    const label = isTop
      ? `Top ${name}: ${col.top} blocks. Pour into the ${name} tray, or press Move down.`
      : `Bottom ${name}: ${col.bottom} of ${CELLS_PER_TRAY} filled.`;

    const tray = h(
      "button",
      {
        class:
          `tray tray--${which}` +
          (isTop && selected ? " tray--selected" : "") +
          (isTop && col.top === 0 ? " tray--empty" : ""),
        type: "button",
        attrs: {
          "aria-label": label,
          "aria-pressed": isTop ? selected : undefined,
          disabled: isTop && col.top === 0 ? true : undefined,
        },
        dataset: { place: String(place), which, focus: `${which}:${place}` },
        on: {
          click: (e) => {
            e.preventDefault();
            if (isTop) this.selectPlace(place);
            else this.activateBottom(place);
          },
          keydown: (e) => this.onTrayKeydown(e as KeyboardEvent, place, which),
        },
      },
      [grid],
    );

    if (isTop) this.topTrays[place] = tray;
    else this.bottomTrays[place] = tray;
    return tray;
  }

  /** Grid position (0..9, top-down / left-right) → fill order for this tray. */
  private fillOrder(which: "top" | "bottom", position: number): number {
    if (which === "top") return position; // top fills top-down, left-to-right
    // bottom fills bottom-up, right-to-left
    const row = Math.floor(position / 2);
    const col = position % 2;
    return (4 - row) * 2 + (1 - col);
  }

  private renderControls(): void {
    clear(this.controlsEl);

    if (this.machine.phase === "combining") {
      const sel = this.machine.selectedPlace;
      const canMove = sel != null && this.machine.canMove(sel);
      this.controlsEl.append(
        // "Move down" slides the whole top stack into its tray at once — the same
        // action as a drag release, not a single block at a time.
        this.button("Move down ↓", "primary", () => sel != null && this.applyPour(sel), "move-down", !canMove),
        this.button("New", "ghost", () => this.handlers.onNew(), "new"),
      );
      return;
    }

    this.controlsEl.append(
      this.button("Next problem", "primary", () => this.handlers.onNext(), "next"),
    );
  }

  private button(label: string, kind: "primary" | "ghost", onClick: () => void, focus: FocusKey, disabled = false): HTMLElement {
    return h("button", {
      class: `btn btn--${kind}`,
      type: "button",
      text: label,
      attrs: { disabled: disabled ? true : undefined },
      dataset: { focus },
      on: { click: () => onClick() },
    });
  }

  private updatePrompt(): void {
    const sel = this.machine.selectedPlace;
    if (this.machine.phase === "combining" && sel == null) {
      // The first-visit intro teaches the drag visually; keep the instruction for screen readers.
      this.promptEl.replaceChildren(h("span", { class: "sr-only", text: "Drag a top stack down into its tray." }));
      return;
    }
    this.promptEl.textContent =
      this.machine.phase === "combining"
        ? `Pour the top ${placeName(sel!)} stack into the ${placeName(sel!)} tray, or press Move down.`
        : "You combined all the blocks.";
  }

  /* --------------------------------------------------------------- selection */

  private selectPlace(place: number): void {
    if (this.machine.phase !== "combining") return;
    if (this.machine.column(place).top === 0) return;
    const already = this.machine.selectedPlace === place;
    this.machine.selectedPlace = place;
    this.invalidStreak = 0;
    if (!already) {
      announce(`Picked up top ${placeName(place)}: ${this.machine.column(place).top} blocks. Pour them into the ${placeName(place)} tray below.`);
    }
    this.pendingFocus = `top:${place}`;
    this.renderBoard();
    this.renderControls();
    this.updatePrompt();
  }

  private clearSelection(): void {
    if (this.machine.selectedPlace == null) return;
    const place = this.machine.selectedPlace;
    this.machine.selectedPlace = null;
    announce(`${placeName(place)} released.`);
    this.renderBoard();
    this.renderControls();
    this.updatePrompt();
  }

  private activateBottom(place: number): void {
    if (this.machine.phase !== "combining") return;
    const sel = this.machine.selectedPlace;
    if (sel == null) {
      announce("First tap a top stack to pick it up.");
      return;
    }
    if (sel === place) {
      this.applyPour(place);
    } else {
      this.reportInvalidColumn(sel);
    }
  }

  private onTrayKeydown(e: KeyboardEvent, place: number, which: "top" | "bottom"): void {
    if (e.key === "Escape") {
      this.clearSelection();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? -1 : 1;
      for (let p = place + dir; p >= 0 && p < this.machine.columnCount; p += dir) {
        const trays = which === "top" ? this.topTrays : this.bottomTrays;
        const el = trays[p];
        if (el && !(el as HTMLButtonElement).disabled) {
          el.focus();
          break;
        }
      }
    }
  }

  /* -------------------------------------------------------------- actions */

  /** Pour the whole top stack (drag release or tap on the bottom tray). */
  private applyPour(place: number, ghost: HTMLElement | null = null): void {
    if (this.animating) {
      ghost?.remove();
      return;
    }
    const srcRect = this.topTrays[place]?.getBoundingClientRect() ?? null;
    const result = this.machine.pour(place);
    if (!result.ok) {
      ghost?.remove();
      if (result.reason === "no-piece") this.reportInvalidColumn(place);
      return;
    }
    playCue(result.carried > 0 ? "exchange" : "move", this.prefs.sound);
    this.commit(result, srcRect, ghost);
  }

  /** Announce, animate, then settle to the canonical state. */
  private commit(result: MoveResult, srcRect: DOMRect | null, ghost: HTMLElement | null = null): void {
    this.invalidStreak = 0;
    if (this.machine.selectedPlace != null && this.machine.column(this.machine.selectedPlace).top === 0) {
      this.machine.selectedPlace = null;
    }
    this.announceAction(result);

    const finalize = () => {
      this.clearLeftovers();
      this.animating = false;
      this.pouringPlace = null;
      this.pendingFocus = this.firstMovableFocus();
      this.renderBoard();
      this.renderControls();
      this.updatePrompt();
      if (result.completed) this.showCompletion();
    };

    const canAnimate = !this.prefs.reducedMotion && srcRect != null && typeof (Element.prototype as unknown as { animate?: unknown }).animate === "function";
    if (!canAnimate) {
      ghost?.remove();
      finalize();
      return;
    }

    this.animating = true;
    this.pouringPlace = result.from;

    // Hold an intermediate picture while the blocks pour in: the poured column's
    // bottom shows its peak fill (a full ten when it will carry), and the carry
    // has not yet reached the target column's top.
    const carrying = result.carried > 0;
    const visual = this.machine.snapshotColumns();
    visual[result.from].top = 0;
    visual[result.from].bottom = result.filledTo;
    if (carrying && result.to >= 0) visual[result.to].top -= result.carried;
    this.renderBoard(visual);
    this.renderControls();

    // Once the pour has landed, a full frame compresses into one carry block that
    // arcs into the next column's top; then we settle to the canonical state.
    const carryThenFinish = () => {
      if (carrying) this.compressAndCarry(result, finalize);
      else finalize();
    };

    if (ghost) {
      // Drag release: glide the lifted stack down into the bottom tray, then carry.
      this.slidePourIn(result, ghost, carryThenFinish);
      return;
    }

    // Tap / keyboard pour: blocks drop into the bottom tray from above.
    this.markPourIn(result.from, result.bottomBefore, result.filledTo);
    this.placeLeftovers(result, true);
    this.after(POUR_MS, carryThenFinish);
  }

  /**
   * Glide the lifted ghost from where it was released down onto the bottom tray,
   * then cross-fade it into the freshly-poured cells so the stack reads as
   * sliding into place rather than snapping. `done` runs once the stack has
   * settled, so any carry can compress and fly on from the filled frame.
   */
  private slidePourIn(result: MoveResult, ghost: HTMLElement, done: () => void): void {
    const bottomTray = this.bottomTrays[result.from];
    const target = bottomTray?.getBoundingClientRect() ?? null;
    if (!bottomTray || !target) {
      ghost.remove();
      done();
      return;
    }

    // Hold the freshly-filled cells (from the old fill up to the peak) hidden
    // until the gliding stack arrives over them.
    const poured = this.pouredCells(result.from, result.bottomBefore, result.filledTo);
    for (const c of poured) c.classList.add("cell--settling");

    const layers = Array.from(ghost.querySelectorAll<HTMLElement>(".tray-ghost__col"));
    const land = () => {
      // Blocks past ten stay where the ghost left them, piled above the frame.
      this.placeLeftovers(result, false);
      // Reveal the settled cells as the ghost fades out over them; the overlap
      // hides the top→bottom fill re-arrangement.
      for (const c of poured) {
        c.classList.remove("cell--settling");
        c.classList.add("cell--land");
      }
      const fade = ghost.animate([{ opacity: 0.94 }, { opacity: 0 }], {
        duration: 130,
        easing: "ease-out",
        fill: "forwards",
      });
      const cleanup = () => {
        ghost.remove();
        done();
      };
      fade.onfinish = cleanup;
      fade.oncancel = cleanup;
    };

    if (!layers.length) {
      land();
      return;
    }
    // Glide each column down to its own resting slot on the pile — that is where
    // the freshly-poured cells sit, so the cross-fade lines up.
    let pending = layers.length;
    const oneDone = () => { if (--pending <= 0) land(); };
    for (const layer of layers) {
      const restDy = Number(layer.dataset.restDy) || 0;
      const start = layer.style.transform || "translate(0px, 0px)";
      const slide = layer.animate(
        [{ transform: start }, { transform: `translate(0px, ${restDy}px)` }],
        { duration: SLIDE_MS, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)", fill: "forwards" },
      );
      slide.onfinish = oneDone;
      slide.oncancel = oneDone;
    }
  }

  private announceAction(result: MoveResult): void {
    const from = placeName(result.from);
    const parts: string[] = [];
    if (result.poured > 0) parts.push(`Poured ${result.poured} into the ${from} tray.`);
    if (result.carried > 0) {
      parts.push(`Filled ten — carried one to ${placeName(result.to)}, ${result.remainder} left.`);
    }
    if (parts.length) announce(parts.join(" "));
  }

  /** Flag the freshly-poured bottom cells so CSS can drop them in. */
  private markPourIn(place: number, fromOrder: number, toOrder: number): void {
    for (const c of this.pouredCells(place, fromOrder, toOrder)) c.classList.add("cell--pour-in");
  }

  /** The bottom-tray cells in the given fill-order range. */
  private pouredCells(place: number, fromOrder: number, toOrder: number): HTMLElement[] {
    const tray = this.bottomTrays[place];
    if (!tray) return [];
    const cells: HTMLElement[] = [];
    for (let order = fromOrder; order < toOrder; order++) {
      const c = tray.querySelector<HTMLElement>(`.cell[data-order="${order}"]`);
      if (c) cells.push(c);
    }
    return cells;
  }

  /**
   * A full frame of ten just landed in `fromPlace`'s bottom tray. The ten blocks
   * lift off the frame toward the viewer, gather into the tray centre and fuse
   * into one block, and that single block — now worth ten — arcs up-left into
   * `toPlace`'s top tray. Only then do any leftover blocks piled above the frame
   * drift down into it.
   */
  private compressAndCarry(result: MoveResult, done: () => void): void {
    const fromPlace = result.from;
    const toPlace = result.to;
    const fromTray = this.bottomTrays[fromPlace];
    const cells = fromTray ? Array.from(fromTray.querySelectorAll<HTMLElement>(".cell--filled")) : [];
    if (!fromTray || !cells.length || !this.canAnimateGhost()) {
      this.after(BOUNCE_MS, done);
      return;
    }
    const fromRect = fromTray.getBoundingClientRect();
    const cx = fromRect.left + fromRect.width / 2;
    const cy = fromRect.top + fromRect.height / 2;
    const size = cells[0].getBoundingClientRect().width;

    // Lift: each block is swapped for a free-floating copy that swells toward the
    // viewer while drawing slightly inward, then they all converge on the centre.
    const BEVEL = ", inset 0 -3px 0 rgba(78, 145, 178, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.5)";
    const clones: HTMLElement[] = [];
    for (const c of cells) {
      const r = c.getBoundingClientRect();
      const clone = c.cloneNode(false) as HTMLElement;
      clone.classList.remove("cell--pour-in", "cell--land");
      clone.classList.add("merge-cell");
      clone.style.left = `${r.left}px`;
      clone.style.top = `${r.top}px`;
      clone.style.width = `${r.width}px`;
      clone.style.height = `${r.height}px`;
      document.body.append(clone);
      clones.push(clone);
      // Leave an empty slot behind so the frame's ten places stay visible.
      c.classList.replace("cell--filled", "cell--empty");

      const dx = cx - (r.left + r.width / 2);
      const dy = cy - (r.top + r.height / 2);
      const order = Number(c.dataset.order) || 0;
      clone.animate(
        [
          { transform: "translate(0px, 0px) scale(1)", boxShadow: `0 2px 4px rgba(23, 36, 43, 0.15)${BEVEL}`, offset: 0 },
          {
            transform: `translate(${dx * 0.18}px, ${dy * 0.18 - 6}px) scale(${LIFT_SCALE})`,
            boxShadow: `0 18px 30px rgba(23, 36, 43, 0.22)${BEVEL}`,
            offset: 0.55,
          },
          {
            // Ten shadows stacking at the centre would pool into a dark blob, so
            // they fade out as the blocks converge; the merged block brings its own.
            transform: `translate(${dx}px, ${dy - 6}px) scale(${LIFT_SCALE})`,
            boxShadow: `0 18px 30px rgba(23, 36, 43, 0)${BEVEL}`,
            offset: 1,
          },
        ],
        { duration: GATHER_MS, delay: order * 14, easing: "cubic-bezier(0.45, 0, 0.4, 1)", fill: "forwards" },
      );
    }

    // Merge: once the stack has gathered, the copies vanish under a single block
    // that thumps into being where they met.
    const block = h("div", { class: "fly-block fly-block--lifted" });
    block.style.width = `${size}px`;
    block.style.height = `${size}px`;
    block.style.left = `${cx - size / 2}px`;
    block.style.top = `${cy - size / 2}px`;
    block.style.opacity = "0";

    const toRect = this.topTrays[toPlace]?.getBoundingClientRect() ?? null;
    const cleanup = () => {
      for (const c of clones) c.remove();
      block.remove();
      done();
    };

    const gathered = GATHER_MS + (CELLS_PER_TRAY - 1) * 14;
    this.after(gathered, () => {
      document.body.append(block);
      block.style.opacity = "1";
      for (const c of clones) c.remove();
      const merge = block.animate(
        [
          { transform: `translate(0px, -6px) scale(${LIFT_SCALE})`, filter: "brightness(1.25)" },
          { transform: `translate(0px, -6px) scale(${LIFT_SCALE * 1.22})`, filter: "brightness(1.12)", offset: 0.4 },
          { transform: `translate(0px, -6px) scale(${LIFT_SCALE})`, filter: "brightness(1)" },
        ],
        { duration: MERGE_MS, easing: "ease-out", fill: "forwards" },
      );
      merge.onfinish = () => {
        // The ten have gone; the leftovers piled above settle into the emptied frame.
        let pending = 2;
        const oneDone = () => { if (--pending <= 0) cleanup(); };
        this.driftLeftovers(fromTray, oneDone);
        if (!toRect) {
          oneDone();
          return;
        }
        // Fly: the merged block arcs over to the next column, settling back to
        // block size as it lands on that column's top stack.
        const tx = toRect.left + toRect.width / 2;
        const ty = toRect.top + toRect.height / 2;
        const arc = Math.max(48, Math.abs(cy - ty) * 0.4 + 36);
        const fly = block.animate(
          [
            { transform: `translate(0px, -6px) scale(${LIFT_SCALE})`, offset: 0 },
            { transform: `translate(${(tx - cx) * 0.5}px, ${(ty - cy) * 0.5 - arc}px) scale(${LIFT_SCALE})`, offset: 0.5 },
            { transform: `translate(${tx - cx}px, ${ty - cy}px) scale(1)`, offset: 1 },
          ],
          { duration: BOUNCE_MS, easing: "cubic-bezier(0.35, 0, 0.3, 1)", fill: "forwards" },
        );
        fly.onfinish = oneDone;
        fly.oncancel = oneDone;
      };
      merge.oncancel = cleanup;
    });
  }

  /**
   * Show the blocks past a full ten stacked above `result.from`'s bottom frame,
   * where the pour piled them: each column of the pile keeps the blocks that fell
   * into it (the bottom fills right-first, the top stack left-first), so this
   * matches where the dragged stack came to rest. `dropIn` animates them falling
   * in alongside a tap pour.
   */
  private placeLeftovers(result: MoveResult, dropIn: boolean): void {
    this.clearLeftovers();
    const tray = this.bottomTrays[result.from];
    if (!tray || result.carried === 0 || result.remainder === 0) return;
    const b = result.bottomBefore;
    const t = result.poured;
    const heights = [Math.floor(b / 2) + Math.ceil(t / 2), Math.ceil(b / 2) + Math.floor(t / 2)];
    const ROWS = CELLS_PER_TRAY / 2;
    // Lowest first, right column before left — the order they will refill the frame.
    const slots: { level: number; col: number }[] = [];
    for (let level = ROWS; level < Math.max(...heights); level++) {
      for (const col of [1, 0]) if (level < heights[col]) slots.push({ level, col });
    }
    for (const slot of slots) {
      const r = this.pileSlot(tray, slot.level, slot.col);
      if (!r) continue;
      const el = h("div", { class: "cell cell--filled merge-cell leftover-cell", attrs: { "aria-hidden": "true" } });
      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      el.style.width = `${r.size}px`;
      el.style.height = `${r.size}px`;
      if (dropIn) el.classList.add("cell--pour-in");
      document.body.append(el);
      this.leftovers.push(el);
    }
  }

  /** Let the leftover blocks fall from above the frame into its lowest slots. */
  private driftLeftovers(tray: HTMLElement, done: () => void): void {
    if (!this.leftovers.length) {
      done();
      return;
    }
    let pending = this.leftovers.length;
    const oneDone = () => { if (--pending <= 0) done(); };
    this.leftovers.forEach((el, i) => {
      el.classList.remove("cell--pour-in");
      const target = this.pileSlot(tray, Math.floor(i / 2), 1 - (i % 2));
      if (!target) {
        oneDone();
        return;
      }
      const dx = target.left - parseFloat(el.style.left);
      const dy = target.top - parseFloat(el.style.top);
      const drift = el.animate(
        [
          { transform: "translate(0px, 0px)" },
          { transform: `translate(${dx}px, ${dy + 4}px)`, offset: 0.8 },
          { transform: `translate(${dx}px, ${dy}px)` },
        ],
        { duration: DRIFT_MS, delay: i * 40, easing: "cubic-bezier(0.45, 0, 0.3, 1)", fill: "forwards" },
      );
      drift.onfinish = oneDone;
      drift.oncancel = oneDone;
    });
  }

  /**
   * Screen box of a slot in a bottom pile: `level` counts up from the tray floor
   * (levels past the frame's five rows extend above it), `col` is 0 = left.
   */
  private pileSlot(tray: HTMLElement, level: number, col: number): { left: number; top: number; size: number } | null {
    const cells = Array.from(tray.querySelectorAll<HTMLElement>(".ten-frame > .cell"));
    const ROWS = CELLS_PER_TRAY / 2;
    if (cells.length < CELLS_PER_TRAY) return null;
    const ref = cells[(ROWS - 1 - Math.min(level, ROWS - 1)) * 2 + col].getBoundingClientRect();
    const pitch = cells[2].getBoundingClientRect().top - cells[0].getBoundingClientRect().top;
    const above = Math.max(0, level - (ROWS - 1));
    return { left: ref.left, top: ref.top - above * pitch, size: ref.width };
  }

  private clearLeftovers(): void {
    for (const el of this.leftovers) el.remove();
    this.leftovers = [];
  }

  private reportInvalidColumn(correctPlace: number): void {
    this.invalidStreak += 1;
    playCue("invalid", this.prefs.sound);
    const name = placeName(correctPlace);
    announce(`Pour ${name} into ${name}.`, { assertive: true });
    if (this.invalidStreak >= 2) this.flashLabels(correctPlace);
  }

  private flashLabels(place: number): void {
    this.boardEl.querySelectorAll<HTMLElement>(`.cell-label[data-place="${place}"] .col-label`).forEach((l) => {
      l.classList.remove("col-label--flash");
      void l.offsetWidth;
      l.classList.add("col-label--flash");
    });
  }

  private firstMovableFocus(): FocusKey | null {
    for (let p = 0; p < this.machine.columnCount; p++) {
      if (this.machine.column(p).top > 0) return `top:${p}`;
    }
    return null;
  }

  /* -------------------------------------------------------------- completion */

  private showCompletion(): void {
    this.machine.selectedPlace = null;
    this.screenEl.dataset.phase = "complete";
    playCue("complete", this.prefs.sound);
    this.renderResult();
    this.renderControls();
    this.updatePrompt();
    announce("You combined all the blocks. Every top stack is empty.");
    this.pendingFocus = "next";
    this.restorePendingFocus();
  }

  private renderResult(): void {
    clear(this.resultEl);
    this.resultEl.hidden = false;
    this.resultEl.append(
      h("p", { class: "result__praise", text: "You combined all the blocks!" }),
      h("p", { class: "result__equation", text: this.completedEquationText() }),
    );
  }

  private equationText(): string {
    const { top, bottom } = this.machine.problem;
    return `${formatNumber(top)} + ${formatNumber(bottom)}`;
  }

  private completedEquationText(): string {
    return `${this.equationText()} = ${formatNumber(this.machine.problem.sum)}`;
  }

  private spokenAddends(): string {
    const { top, bottom } = this.machine.problem;
    return `${formatNumber(top)} plus ${formatNumber(bottom)}.`;
  }

  /* ------------------------------------------------------------ pointer input */

  private handlePointerDown(e: PointerEvent): void {
    if (this.animating) return;
    if (this.activePointerId !== null) return;
    if (this.machine.phase !== "combining") return;

    const target = e.target as HTMLElement;
    // Grab the whole top stack: pressing anywhere on it — filled blocks, empty
    // cells, tray padding, or the overflow blocks hovering above — lifts all of
    // its blocks together and drags them down as one section.
    const stack = target.closest<HTMLElement>(".stack--top");
    if (!stack) return;
    const place = Number(stack.querySelector<HTMLElement>(".tray--top")?.dataset.place);
    if (Number.isNaN(place) || !this.machine.canPour(place)) return;
    const originTray = this.topTrays[place];
    if (!originTray) return;

    this.activePointerId = e.pointerId;
    this.drag = { place, ghost: null, cols: [], originTray, startX: e.clientX, startY: e.clientY, moved: false, maxDy: Infinity };
    try {
      originTray.setPointerCapture(e.pointerId);
    } catch {
      /* best-effort */
    }
    this.attachWindowListeners();
    e.preventDefault();
  }

  private handlePointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId || !this.drag) return;
    const dx = e.clientX - this.drag.startX;
    const dy = e.clientY - this.drag.startY;
    if (!this.drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      this.beginGhost();
    }
    e.preventDefault();
    // Vertical axis only. Each column slides on its own until its lowest block
    // meets that column's pile — a taller pile stops its column early while the
    // other keeps sliding down into place.
    for (const col of this.drag.cols) {
      col.el.style.transform = `translate(0px, ${Math.min(dy, col.maxDy)}px)`;
    }
    this.updateHoverTarget(e.clientY);

    // Every column has landed: scrape the blocks in now, without waiting for release.
    if (dy >= this.drag.maxDy) {
      const { place, ghost } = this.drag;
      this.endPointer();
      if (ghost) {
        this.pendingFocus = `top:${place}`;
        this.applyPour(place, ghost);
      }
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId || !this.drag) {
      this.endPointer();
      return;
    }
    const { place, moved, ghost } = this.drag;
    if (!moved) {
      this.teardownGhost();
      this.endPointer();
      this.selectPlace(place);
      return;
    }
    const dropped = this.overOwnBottomTray(place, e.clientY);
    // Keep the lifted ghost in the DOM and hand it to the glide so the blocks
    // slide to rest instead of snapping. endPointer only releases the pointer.
    this.endPointer();
    if (!ghost) {
      this.renderBoard();
      return;
    }
    if (dropped) {
      this.pendingFocus = `top:${place}`;
      this.applyPour(place, ghost);
    } else {
      this.springGhostBack(ghost);
    }
  }

  private handlePointerCancel(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) return;
    this.cancelActiveManipulation();
  }

  private beginGhost(): void {
    if (!this.drag) return;
    this.drag.moved = true;
    const place = this.drag.place;
    const tray = this.drag.originTray;
    const bottomTray = this.bottomTrays[place];
    const trayRect = tray.getBoundingClientRect();

    // A wrapper pinned over the top tray, holding one movable layer per column of
    // blocks. Each layer slides on its own so a column that meets a taller pile
    // stops early while the other keeps sliding down into its own open slot.
    const ghost = h("div", { class: "tray-ghost" });
    ghost.style.left = `${trayRect.left}px`;
    ghost.style.top = `${trayRect.top}px`;
    ghost.style.width = `${trayRect.width}px`;
    ghost.style.height = `${trayRect.height}px`;

    const frame = tray.querySelector<HTMLElement>(".ten-frame");
    const rowGap = frame ? getComputedStyle(frame).rowGap : "0px";
    // The ghost lives on <body>, outside the board that defines the responsive
    // cell size, so pin its cloned cells to the board's current cell size.
    const sampleCell = tray.querySelector<HTMLElement>(".cell");
    if (sampleCell) ghost.style.setProperty("--cell", `${sampleCell.getBoundingClientRect().width}px`);

    const cols: { el: HTMLElement; maxDy: number }[] = [];
    let overall = 0;
    for (let col = 0; col < 2; col++) {
      const cells = this.topColumnFilled(tray, col);
      if (!cells.length) continue;
      const region = this.unionRect(cells)!;
      const layer = h("div", { class: "tray-ghost__col" });
      layer.style.position = "absolute";
      layer.style.left = `${region.left - trayRect.left}px`;
      layer.style.top = `${region.top - trayRect.top}px`;
      layer.style.width = `${region.width}px`;
      layer.style.display = "flex";
      layer.style.flexDirection = "column";
      layer.style.gap = rowGap;
      for (const c of cells) {
        const clone = c.cloneNode(true) as HTMLElement;
        clone.removeAttribute("style");
        layer.append(clone);
      }
      // This column's lowest block drops onto this column's own pile.
      const landing = bottomTray ? this.columnLandingY(bottomTray, col) : region.bottom;
      const maxDy = Math.max(0, landing - region.bottom);
      layer.dataset.restDy = String(maxDy);
      ghost.append(layer);
      cols.push({ el: layer, maxDy });
      overall = Math.max(overall, maxDy);
    }

    document.body.append(ghost);
    this.drag.ghost = ghost;
    this.drag.cols = cols;
    this.drag.maxDy = overall;
    tray.classList.add("tray--lifted");
    bottomTray?.classList.add("tray--target");
  }

  /** Filled top-tray cells in one grid column (0 = left, 1 = right), top-down. */
  private topColumnFilled(tray: HTMLElement, col: number): HTMLElement[] {
    const cells = Array.from(tray.querySelectorAll<HTMLElement>(".ten-frame > .cell"));
    return cells.filter((c, i) => i % 2 === col && c.classList.contains("cell--filled"));
  }

  /**
   * Screen-Y where a block dropped into one bottom column comes to rest: the
   * bottom edge of that column's lowest open slot (which sits on top of its pile,
   * or on the tray floor when the column is empty). Because each column fills
   * bottom-up independently, a half-filled top row makes one column's landing a
   * row lower than the other's.
   */
  private columnLandingY(tray: HTMLElement, col: number): number {
    const cells = Array.from(tray.querySelectorAll<HTMLElement>(".ten-frame > .cell"));
    let lowestEmpty: HTMLElement | null = null;
    let lowestEmptyRow = -1;
    let highestFilled: HTMLElement | null = null;
    let highestFilledRow = Infinity;
    for (let i = 0; i < cells.length; i++) {
      if (i % 2 !== col) continue;
      const row = Math.floor(i / 2);
      if (cells[i].classList.contains("cell--filled")) {
        if (row < highestFilledRow) { highestFilledRow = row; highestFilled = cells[i]; }
      } else if (row > lowestEmptyRow) {
        lowestEmptyRow = row;
        lowestEmpty = cells[i];
      }
    }
    if (lowestEmpty) return lowestEmpty.getBoundingClientRect().bottom;
    // Column already full: rest on top of its pile.
    return highestFilled
      ? highestFilled.getBoundingClientRect().top
      : tray.getBoundingClientRect().bottom;
  }

  /** Bounding box that encloses all the given elements (null if none). */
  private unionRect(els: HTMLElement[]): DOMRect | null {
    if (!els.length) return null;
    let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      top = Math.min(top, r.top);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    return new DOMRect(left, top, right - left, bottom - top);
  }

  private teardownGhost(): void {
    if (!this.drag) return;
    this.drag.ghost?.remove();
    this.drag.originTray.classList.remove("tray--lifted");
    for (const t of this.bottomTrays) t?.classList.remove("tray--target", "tray--hover");
  }

  private updateHoverTarget(y: number): void {
    const place = this.drag?.place;
    if (place == null) return;
    this.bottomTrays[place]?.classList.toggle("tray--hover", this.overOwnBottomTray(place, y));
  }

  private applyTargetHighlight(): void {
    const sel = this.machine.selectedPlace;
    if (sel != null) this.bottomTrays[sel]?.classList.add("tray--target");
  }

  /**
   * Since drags are vertical-only, the sole drop target is this column's own
   * bottom tray directly below — accept the drop once the pointer reaches its
   * (padded) vertical band, regardless of any sideways drift.
   */
  private overOwnBottomTray(place: number, y: number): boolean {
    const t = this.bottomTrays[place];
    if (!t) return false;
    const r = t.getBoundingClientRect();
    // Pulled down far enough to reach the tray (no upper bound — an overshoot
    // past the tray is still a clear "drop it in" gesture).
    return y >= r.top - DROP_PADDING;
  }

  /** Released short of the tray: glide the columns back up to where they lifted. */
  private springGhostBack(ghost: HTMLElement): void {
    for (const t of this.bottomTrays) t?.classList.remove("tray--target", "tray--hover");
    const settle = () => {
      this.animating = false;
      ghost.remove();
      this.renderBoard(); // restores the un-lifted stack in place
    };
    const layers = Array.from(ghost.querySelectorAll<HTMLElement>(".tray-ghost__col"));
    if (!this.canAnimateGhost() || !layers.length) {
      settle();
      return;
    }
    this.animating = true;
    let pending = layers.length;
    const oneDone = () => { if (--pending <= 0) settle(); };
    for (const layer of layers) {
      const start = layer.style.transform || "translate(0px, 0px)";
      const back = layer.animate(
        [{ transform: start }, { transform: "translate(0px, 0px)" }],
        { duration: SLIDE_MS, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)", fill: "forwards" },
      );
      back.onfinish = oneDone;
      back.oncancel = oneDone;
    }
  }

  private canAnimateGhost(): boolean {
    return (
      !this.prefs.reducedMotion &&
      typeof (Element.prototype as unknown as { animate?: unknown }).animate === "function"
    );
  }

  private cancelActiveManipulation(): void {
    if (this.drag) {
      this.teardownGhost();
      this.renderBoard();
    }
    this.endPointer();
  }

  private endPointer(): void {
    if (this.drag) {
      try {
        this.drag.originTray.releasePointerCapture(this.activePointerId ?? -1);
      } catch {
        /* ignore */
      }
    }
    this.drag = null;
    this.activePointerId = null;
    this.detachWindowListeners();
  }

  private attachWindowListeners(): void {
    window.addEventListener("pointermove", this.onPointerMove, { passive: false });
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
    window.addEventListener("resize", this.onWindowResize);
  }

  private detachWindowListeners(): void {
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
    window.removeEventListener("resize", this.onWindowResize);
  }

  /* -------------------------------------------------------------------- utils */

  private after(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
  }

  private restorePendingFocus(): void {
    if (!this.pendingFocus) return;
    const el = this.screenEl.querySelector<HTMLElement>(`[data-focus="${this.pendingFocus}"]`);
    if (el && !(el as HTMLButtonElement).disabled) {
      el.focus();
      this.pendingFocus = null;
    }
  }
}
