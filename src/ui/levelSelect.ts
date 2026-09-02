import { h, clear } from "./dom";
import { levelRange, levelTitle, PLACE_NAMES } from "../core/placeValue";
import { LEVELS, type Level } from "../core/types";

interface LevelSelectOptions {
  current: Level | null;
  onChoose: (level: Level) => void;
}

const DESCRIPTIONS: Record<Level, string> = {
  0: "Single blocks. A gentle place to begin.",
  1: "Blocks in tens and ones.",
  2: "Hundreds, tens, and ones.",
  3: "Up to four places, into the thousands.",
};

export function renderLevelSelect(root: HTMLElement, opts: LevelSelectOptions): void {
  clear(root);

  const cards = LEVELS.map((level) => {
    const isCurrent = level === opts.current;
    return h(
      "button",
      {
        class: "level-card" + (isCurrent ? " level-card--current" : ""),
        type: "button",
        attrs: {
          "aria-label": `${levelTitle(level)}, ${PLACE_NAMES[level]}, numbers from ${levelRange(
            level,
          )}${isCurrent ? ", most recent choice" : ""}`,
        },
        on: { click: () => opts.onChoose(level) },
      },
      [
        h("span", { class: "level-card__index", text: String(level + 1) }),
        h("span", { class: "level-card__name", text: levelTitle(level) }),
        h("span", { class: "level-card__range", text: levelRange(level) }),
        h("span", { class: "level-card__desc", text: DESCRIPTIONS[level] }),
        isCurrent ? h("span", { class: "level-card__badge", text: "Last chosen" }) : null,
      ],
    );
  });

  root.append(
    h("section", { class: "screen screen--level", attrs: { id: "main" } }, [
      h("header", { class: "level-head" }, [
        h("h1", { class: "level-head__title", text: "Choose a place value" }),
        h("p", {
          class: "level-head__sub",
          text: "Pick how big the numbers go. You can change this anytime.",
        }),
      ]),
      h("div", { class: "levels", attrs: { role: "list" } }, cards.map((c) => {
        c.setAttribute("role", "listitem");
        return c;
      })),
    ]),
  );
}
