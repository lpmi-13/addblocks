import { h } from "./dom";
import type { Preferences } from "../preferences";

interface MenuOptions {
  prefs: Preferences;
  onChange: (prefs: Preferences) => void;
}

/**
 * A minimal hamburger menu, fixed to the upper-right of the page, holding the
 * app-wide settings. Present on every screen so preferences are always at hand.
 */
export class Menu {
  private host: HTMLElement;
  private prefs: Preferences;
  private onChange: (prefs: Preferences) => void;

  private toggleBtn!: HTMLButtonElement;
  private panel!: HTMLElement;
  private scrim!: HTMLElement;
  private open = false;

  private readonly onDocKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.open) this.setOpen(false);
  };

  constructor(host: HTMLElement, opts: MenuOptions) {
    this.host = host;
    this.prefs = opts.prefs;
    this.onChange = opts.onChange;
  }

  mount(): void {
    this.toggleBtn = h("button", {
      class: "menu-toggle",
      type: "button",
      attrs: {
        "aria-label": "Settings",
        "aria-haspopup": "true",
        "aria-expanded": "false",
        "aria-controls": "menu-panel",
      },
      on: { click: () => this.setOpen(!this.open) },
    }, [
      h("span", { class: "menu-toggle__bars", attrs: { "aria-hidden": "true" } }, [
        h("span", { class: "menu-toggle__bar" }),
        h("span", { class: "menu-toggle__bar" }),
        h("span", { class: "menu-toggle__bar" }),
      ]),
    ]) as HTMLButtonElement;

    this.scrim = h("div", {
      class: "menu-scrim",
      attrs: { hidden: true },
      on: { click: () => this.setOpen(false) },
    });

    this.panel = h("div", {
      class: "menu-panel",
      attrs: { id: "menu-panel", role: "dialog", "aria-label": "Settings", hidden: true },
    }, [
      h("h2", { class: "menu-panel__title", text: "Settings" }),
      h("div", { class: "menu-panel__body" }, [
        this.toggle("showNumbers", "Show numbers", "Label each block stack with its digit."),
        this.toggle("sound", "Sound", "Soft tones for moves and exchanges."),
        this.toggle("reducedMotion", "Reduced motion", "Cross-fade instead of sliding."),
      ]),
    ]);

    this.host.append(this.scrim, this.toggleBtn, this.panel);
    document.addEventListener("keydown", this.onDocKeydown);
  }

  private toggle(key: keyof Preferences, label: string, description: string): HTMLElement {
    const input = h("input", {
      type: "checkbox",
      class: "switch__input",
      attrs: { role: "switch", "aria-checked": this.prefs[key], id: `pref-${key}` },
    }) as HTMLInputElement;
    input.checked = this.prefs[key];
    input.addEventListener("change", () => {
      this.prefs = { ...this.prefs, [key]: input.checked };
      input.setAttribute("aria-checked", String(input.checked));
      this.onChange(this.prefs);
    });
    return h("div", { class: "switch" }, [
      h("label", { class: "switch__label", attrs: { for: `pref-${key}` } }, [
        h("span", { class: "switch__name", text: label }),
        h("span", { class: "switch__desc", text: description }),
      ]),
      h("span", { class: "switch__control" }, [input, h("span", { class: "switch__track" })]),
    ]);
  }

  private setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.toggleBtn.classList.toggle("menu-toggle--open", open);
    this.toggleBtn.setAttribute("aria-expanded", String(open));
    this.panel.hidden = !open;
    this.scrim.hidden = !open;
    if (open) {
      this.panel.querySelector<HTMLElement>(".switch__input")?.focus();
    } else {
      this.toggleBtn.focus();
    }
  }
}
