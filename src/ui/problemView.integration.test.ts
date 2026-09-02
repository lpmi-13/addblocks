// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ProblemView } from "./problemView";
import { LessonMachine } from "../core/lessonMachine";
import type { Level, Problem } from "../core/types";
import type { Preferences } from "../preferences";

const PREFS: Preferences = { showNumbers: false, sound: false, reducedMotion: true };

function problem(top: number, bottom: number): Problem {
  const width = Math.max(String(top).length, String(bottom).length);
  const level = Math.min(3, Math.max(0, width - 1)) as Level;
  return { level, seed: 0, top, bottom, sum: top + bottom };
}

function setupDom(): HTMLElement {
  document.body.innerHTML =
    '<div id="app"></div><div id="live-polite"></div><div id="live-assertive"></div>';
  (globalThis as unknown as { requestAnimationFrame: (cb: () => void) => number }).requestAnimationFrame =
    (cb: () => void) => {
      cb();
      return 0;
    };
  return document.getElementById("app")!;
}

function q<T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
}

function mount(
  top: number,
  bottom: number,
  prefs: Preferences = PREFS,
): { root: HTMLElement; view: ProblemView; machine: LessonMachine } {
  const root = setupDom();
  const machine = new LessonMachine(problem(top, bottom));
  const view = new ProblemView(root, machine, prefs, { onChangeLevel: () => {}, onNext: () => {}, onNew: () => {} });
  view.mount();
  return { root, view, machine };
}

/** Tap a top tray to select it, then tap its bottom tray to pour the whole stack. */
function pour(root: HTMLElement, place: number): void {
  q(root, `.tray--top[data-place="${place}"]`).click();
  q(root, `.tray--bottom[data-place="${place}"]`).click();
}

/** Tap a top tray, then press Move down to move a single block. */
function moveOne(root: HTMLElement, place: number): void {
  q(root, `.tray--top[data-place="${place}"]`).click();
  q(root, '[data-focus="move-down"]').click();
}

describe("ProblemView — pour & bounce flow", () => {
  beforeEach(() => setupDom());

  it("shows the blocks immediately, with no digit step", () => {
    const { root, machine } = mount(3, 4);
    expect(machine.phase).toBe("combining");
    expect(root.querySelector('[data-focus="show-blocks"]')).toBeNull();
    expect(root.querySelectorAll(".cell--piece").length).toBe(3); // 3 top ones
  });

  it("pours a stack, fills the bottom to ten, and bounces the overflow left", () => {
    const { root, machine } = mount(8, 5);
    pour(root, 0);
    expect(machine.column(0)).toEqual({ top: 0, bottom: 10 });
    expect(machine.column(1)).toEqual({ top: 3, bottom: 0 });
    // a new tens column has appeared holding the 3 bounced blocks
    expect(root.querySelectorAll('.tray--top[data-place="1"] .cell--piece').length).toBe(3);
  });

  it("completes once every top stack is emptied", () => {
    const { root, machine } = mount(8, 5);
    pour(root, 0); // bounces 3 into the tens column
    expect(machine.isComplete()).toBe(false);
    pour(root, 1); // pours the bounced blocks down
    expect(machine.isComplete()).toBe(true);
    expect(q(root, ".result__praise").textContent).toContain("combined all the blocks");
  });

  it("moves a single block with Move down", () => {
    const { root, machine } = mount(3, 4);
    moveOne(root, 0);
    expect(machine.column(0)).toEqual({ top: 2, bottom: 5 });
    expect(machine.isComplete()).toBe(false);
  });

  it("offers a New button (and no undo/start-over) that requests a fresh challenge", () => {
    const root = setupDom();
    let requested = 0;
    const machine = new LessonMachine(problem(8, 5));
    const view = new ProblemView(root, machine, PREFS, {
      onChangeLevel: () => {},
      onNext: () => {},
      onNew: () => { requested += 1; },
    });
    view.mount();
    expect(root.querySelector('[data-focus="undo"]')).toBeNull();
    expect(root.querySelector('[data-focus="restart"]')).toBeNull();
    q(root, '[data-focus="new"]').click();
    expect(requested).toBe(1);
  });
});

describe("ProblemView — number labels", () => {
  beforeEach(() => setupDom());

  it("hides number labels by default and shows live counts when toggled on", () => {
    const { root, view } = mount(3, 4);
    expect(root.querySelector(".stack__num")).toBeNull();

    view.setPreferences({ ...PREFS, showNumbers: true });
    const nums = [...root.querySelectorAll(".stack__num")].map((n) => n.textContent);
    expect(nums).toContain("3"); // top ones
    expect(nums).toContain("4"); // bottom ones
  });
});
