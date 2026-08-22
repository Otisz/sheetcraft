/**
 * The shared formatters. Small, but each encodes a decision worth pinning: a
 * bare `3` is ambiguous on a character sheet, and `Sleight Of Hand` is not what
 * the skill is called.
 */
import { describe, expect, it } from "vitest";
import { nameFor, signed, titleCase, unknownRefLabel } from "@/features/dnd/play/format";

describe("signed", () => {
  it("marks a positive modifier with a plus", () => {
    expect(signed(3)).toBe("+3");
  });

  it("marks zero with a plus — a `+0` is a modifier, a bare `0` is ambiguous", () => {
    expect(signed(0)).toBe("+0");
  });

  it("leaves a negative modifier with its own sign", () => {
    expect(signed(-1)).toBe("-1");
  });
});

describe("titleCase", () => {
  it("capitalises a single word", () => {
    expect(titleCase("stealth")).toBe("Stealth");
  });

  it("capitalises each word of a hyphenated index", () => {
    expect(titleCase("animal-handling")).toBe("Animal Handling");
  });

  it("keeps a minor word lowercase inside the name", () => {
    // The skill is `Sleight of Hand` in the rulebook, and the sheet is read
    // next to one.
    expect(titleCase("sleight-of-hand")).toBe("Sleight of Hand");
  });

  it("capitalises a minor word when it leads", () => {
    expect(titleCase("of-course")).toBe("Of Course");
  });
});

describe("unknownRefLabel", () => {
  it("names the index, because an index is still information", () => {
    expect(unknownRefLabel("longsword")).toBe("\u26a0 unknown (longsword)");
  });

  it("says so plainly when the ref could not even be parsed", () => {
    expect(unknownRefLabel(null)).toBe("\u26a0 unknown (malformed ref)");
  });
});

describe("nameFor", () => {
  it("returns the resolved name", () => {
    expect(nameFor({ "catalog:longsword": "Longsword" }, "catalog:longsword")).toBe("Longsword");
  });

  it("falls back to the marker when the ref has not resolved", () => {
    expect(nameFor({}, "catalog:longsword")).toBe("\u26a0 unknown (longsword)");
  });
});
