// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { showIntro } from "./intro";
import { hasSeenIntro, markIntroSeen } from "../preferences";

function open(): HTMLDialogElement {
  showIntro(document.body, { reducedMotion: true, onDismiss: markIntroSeen });
  return document.querySelector("dialog.intro")!;
}

// jsdom lacks the modal dialog API; mimic the browser's open/close behaviour.
const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
proto.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
proto.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
};

describe("first-visit intro", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("is unseen on a first visit", () => {
    expect(hasSeenIntro()).toBe(false);
  });

  it("shows a two-column demo with a finger on the right column", () => {
    const dialog = open();
    expect(dialog.hasAttribute("open")).toBe(true);
    const cols = dialog.querySelectorAll(".intro-demo__col");
    expect(cols).toHaveLength(2);
    expect(cols[0].querySelector(".intro-demo__finger")).toBeNull();
    expect(cols[1].querySelector(".intro-demo__finger")).not.toBeNull();
  });

  it("remembers dismissal via the button", () => {
    const dialog = open();
    dialog.querySelector<HTMLButtonElement>("button")!.click();
    expect(document.querySelector("dialog.intro")).toBeNull();
    expect(hasSeenIntro()).toBe(true);
  });

  it("remembers dismissal via a backdrop click", () => {
    const dialog = open();
    dialog.click();
    expect(hasSeenIntro()).toBe(true);
  });
});
