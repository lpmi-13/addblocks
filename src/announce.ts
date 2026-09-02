/**
 * Polite / assertive live-region announcements. Messages are concise and
 * describe outcomes, never individual animation frames (plan §10).
 */
let politeEl: HTMLElement | null = null;
let assertiveEl: HTMLElement | null = null;

function region(assertive: boolean): HTMLElement | null {
  if (assertive) {
    assertiveEl ??= document.getElementById("live-assertive");
    return assertiveEl;
  }
  politeEl ??= document.getElementById("live-polite");
  return politeEl;
}

export function announce(message: string, opts: { assertive?: boolean } = {}): void {
  const el = region(opts.assertive ?? false);
  if (!el) return;
  // Clear first so repeated identical messages are re-announced.
  el.textContent = "";
  window.requestAnimationFrame(() => {
    el.textContent = message;
  });
}
