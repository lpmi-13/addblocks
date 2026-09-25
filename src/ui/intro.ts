import { h } from "./dom";

interface IntroOptions {
  reducedMotion: boolean;
  onDismiss: () => void;
}

// Material "touch_app" glyph: a pointing finger with a press ripple.
const FINGER_SVG = `<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" focusable="false"><path d="M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/></svg>`;

/**
 * First-visit tutorial: a miniature two-column board where a finger drags the
 * top-right stack down into its tray. Closing it by any route (button, Escape,
 * backdrop) counts as dismissal.
 */
export function showIntro(host: HTMLElement, opts: IntroOptions): void {
  const done = h("button", { class: "btn btn--primary", type: "button", text: "Got it" });

  const dialog = h(
    "dialog",
    {
      class: `intro${opts.reducedMotion ? " intro--still" : ""}`,
      attrs: { "aria-labelledby": "intro-title", "aria-describedby": "intro-desc" },
    },
    [
      h("h2", { class: "intro__title", text: "Drag down to add", attrs: { id: "intro-title" } }),
      h("div", { class: "intro-demo", attrs: { "aria-hidden": "true" } }, [
        demoColumn(3, 4, false),
        demoColumn(2, 2, true),
      ]),
      h("p", {
        class: "intro__text",
        text: "Drag each top stack down into the tray below it.",
        attrs: { id: "intro-desc" },
      }),
      done,
    ],
  );

  const close = () => dialog.close();
  done.addEventListener("click", close);
  // A click that lands on the dialog element itself is on the backdrop.
  dialog.addEventListener("click", (e) => e.target === dialog && close());
  dialog.addEventListener("close", () => {
    dialog.remove();
    opts.onDismiss();
  });

  host.append(dialog);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  done.focus();
}

/** One place-value column: a top ten-frame (fills from the top) above a bottom tray (fills from the bottom). */
function demoColumn(top: number, bottom: number, animated: boolean): HTMLElement {
  // In the animated column the first row is the stack being dragged: its slots
  // stay empty in the grid and a floating pair sits over them.
  const topCells = Array.from({ length: 10 }, (_, i) =>
    h("span", { class: `cell ${i < top && !(animated && i < 2) ? "cell--filled" : "cell--empty"}` }),
  );
  const bottomCells = Array.from({ length: 10 }, (_, i) =>
    h("span", { class: `cell ${i >= 10 - bottom ? "cell--filled" : "cell--empty"}` }),
  );

  return h("div", { class: "intro-demo__col" }, [
    h("div", { class: "intro-demo__tray" }, [h("div", { class: "intro-demo__frame" }, topCells)]),
    h("div", { class: "intro-demo__tray intro-demo__tray--bottom" }, [h("div", { class: "intro-demo__frame" }, bottomCells)]),
    animated
      ? h("span", { class: "intro-demo__moving" }, [h("span", { class: "cell cell--filled" }), h("span", { class: "cell cell--filled" })])
      : null,
    animated ? h("span", { class: "intro-demo__arrow" }) : null,
    animated ? h("span", { class: "intro-demo__finger", html: FINGER_SVG }) : null,
  ]);
}
