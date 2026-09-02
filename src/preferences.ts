import type { Level } from "./core/types";

export interface Preferences {
  /** Label each block stack with the digit it represents. */
  showNumbers: boolean;
  /** Play short sounds for moves, exchanges, and completion. */
  sound: boolean;
  /** Cross-fade instead of morphing; skip decorative motion. */
  reducedMotion: boolean;
}

const PREFS_KEY = "addblocks.prefs.v1";
const LEVEL_KEY = "addblocks.level.v1";

function systemReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable; preferences are non-essential */
  }
}

export function loadPreferences(): Preferences {
  const stored = read<Partial<Preferences>>(PREFS_KEY) ?? {};
  return {
    // Blocks are the primary view; numbers are revealed only on request.
    showNumbers: stored.showNumbers ?? false,
    sound: stored.sound ?? false,
    // Honor the OS setting unless the learner has explicitly overridden it.
    reducedMotion: stored.reducedMotion ?? systemReducedMotion(),
  };
}

export function savePreferences(prefs: Preferences): void {
  write(PREFS_KEY, prefs);
}

export function loadLevel(): Level | null {
  const v = read<number>(LEVEL_KEY);
  return v != null && v >= 0 && v <= 3 ? (v as Level) : null;
}

export function saveLevel(level: Level): void {
  write(LEVEL_KEY, level);
}
