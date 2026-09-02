import { renderLevelSelect } from "./levelSelect";
import { Menu } from "./menu";
import { ProblemView } from "./problemView";
import { LessonMachine } from "../core/lessonMachine";
import { generateProblem, stageForIndex } from "../core/problemGenerator";
import { randomSeed } from "../core/rng";
import type { Level } from "../core/types";
import {
  loadLevel,
  loadPreferences,
  savePreferences,
  saveLevel,
  type Preferences,
} from "../preferences";

export class App {
  private root: HTMLElement;
  private screenHost!: HTMLElement;
  private menu!: Menu;
  private prefs: Preferences;
  private lastLevel: Level | null;
  private level: Level | null = null;
  private problemIndex = 0;
  private view: ProblemView | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.prefs = loadPreferences();
    this.lastLevel = loadLevel();
  }

  start(): void {
    this.screenHost = document.createElement("div");
    this.screenHost.className = "screen-host";

    this.menu = new Menu(this.root, {
      prefs: this.prefs,
      onChange: (prefs) => this.applyPreferences(prefs),
    });
    this.menu.mount();
    this.root.append(this.screenHost);

    // Always begin at level selection; the remembered level is only highlighted.
    this.showLevelSelect();
  }

  private applyPreferences(prefs: Preferences): void {
    this.prefs = prefs;
    savePreferences(prefs);
    this.view?.setPreferences(prefs);
  }

  private teardownView(): void {
    this.view?.destroy();
    this.view = null;
  }

  private showLevelSelect(): void {
    this.teardownView();
    renderLevelSelect(this.screenHost, {
      current: this.lastLevel,
      onChoose: (level) => this.chooseLevel(level),
    });
  }

  private chooseLevel(level: Level): void {
    this.level = level;
    this.lastLevel = level;
    this.problemIndex = 0;
    saveLevel(level);
    this.startProblem();
  }

  private startProblem(): void {
    if (this.level == null) {
      this.showLevelSelect();
      return;
    }
    this.teardownView();
    const stage = stageForIndex(this.problemIndex);
    const problem = generateProblem(this.level, randomSeed(), stage);
    const machine = new LessonMachine(problem);
    this.view = new ProblemView(this.screenHost, machine, this.prefs, {
      onChangeLevel: () => this.showLevelSelect(),
      onNext: () => this.nextProblem(),
      // Re-roll a fresh challenge at the same level and difficulty.
      onNew: () => this.startProblem(),
    });
    this.view.mount();
  }

  private nextProblem(): void {
    this.problemIndex += 1;
    this.startProblem();
  }
}
