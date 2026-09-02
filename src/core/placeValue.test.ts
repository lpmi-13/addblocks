import { describe, expect, it } from "vitest";
import {
  digitAt,
  digits,
  formatNumber,
  fromDigits,
  levelMax,
  levelRange,
  levelTitle,
  numDigits,
} from "./placeValue";

describe("digits / fromDigits", () => {
  it("decomposes with ones at index 0", () => {
    expect(digits(0)).toEqual([0]);
    expect(digits(8)).toEqual([8]);
    expect(digits(60)).toEqual([0, 6]);
    expect(digits(10234)).toEqual([4, 3, 2, 0, 1]);
  });

  it("round-trips for 0 through a large result", () => {
    for (let n = 0; n <= 2000; n++) {
      expect(fromDigits(digits(n))).toBe(n);
    }
    for (const n of [99999, 100000, 123456, 199998]) {
      expect(fromDigits(digits(n))).toBe(n);
    }
  });

  it("rejects negative and non-integer input", () => {
    expect(() => digits(-1)).toThrow();
    expect(() => digits(1.5)).toThrow();
  });
});

describe("digitAt / numDigits", () => {
  it("reads individual places", () => {
    expect(digitAt(28, 0)).toBe(8);
    expect(digitAt(28, 1)).toBe(2);
    expect(digitAt(28, 2)).toBe(0);
  });

  it("counts digits with no leading zeros", () => {
    expect(numDigits(0)).toBe(1);
    expect(numDigits(9)).toBe(1);
    expect(numDigits(60)).toBe(2);
    expect(numDigits(100000)).toBe(6);
  });
});

describe("level helpers", () => {
  it("names and ranges each level", () => {
    expect(levelTitle(0)).toBe("Ones");
    expect(levelTitle(2)).toBe("Hundreds");
    expect(levelRange(2)).toBe("0–999");
    expect(levelMax(3)).toBe(9999);
  });

  it("formats numbers with grouping", () => {
    expect(formatNumber(9999)).toBe("9,999");
    expect(formatNumber(60)).toBe("60");
  });
});
