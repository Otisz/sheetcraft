/**
 * Override creation, end to end through `derive()`.
 *
 * The unit tests in `overrides.test.ts` prove `setOverride` writes the record
 * it claims to. These prove the record it writes is one the ENGINE accepts and
 * acts on — which is a different claim, and the one #171's acceptance criteria
 * are actually about: "a player can set an override on a derived value and see
 * the displayed number change".
 *
 * The seam matters because the two halves enforce the same rule separately:
 * `setOverride` sets `op: "set"` and `validate()` rejects anything else. A test
 * on either side alone would still pass if they disagreed about the rule.
 */
import { describe, expect, it } from "vitest";
import { derive, EMPTY_CONTEXT, ModifierValidationError } from "@/features/dnd/derive";
import { makeCharacter } from "@/features/dnd/derive/fixtures";
import { clearOverride } from "@/features/dnd/play/effects";
import { setOverride } from "@/features/dnd/play/overrides";

describe("override creation, end to end through derive()", () => {
  const character = makeCharacter({ abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 } });
  const ctx = { ...EMPTY_CONTEXT, character };

  it("moves the displayed number a player reads off the sheet", () => {
    const before = derive(character, ctx).armorClass;
    const after = derive({ ...character, modifiers: setOverride([], "ac", 21) }, ctx).armorClass;
    expect(after).toBe(21);
    expect(after).not.toBe(before);
  });

  it("clearing returns the derived result", () => {
    const set = setOverride([], "ac", 21);
    const cleared = clearOverride(set, "ac");
    expect(derive({ ...character, modifiers: cleared }, ctx).armorClass).toBe(derive(character, ctx).armorClass);
  });

  it("a second override replaces rather than stacks or errors", () => {
    const twice = setOverride(setOverride([], "ac", 21), "ac", 12);
    expect(twice.filter((m) => m.source === "override")).toHaveLength(1);
    expect(derive({ ...character, modifiers: twice }, ctx).armorClass).toBe(12);
  });

  it("writes records validate() accepts, across every shape of target", () => {
    // The two halves enforce `op: "set"` independently — this is the seam where
    // a disagreement between them would surface.
    for (const t of ["ac", "maxHp", "speed", "ability.str", "save.dex", "skill.stealth", "spell.saveDc"]) {
      expect(() => derive({ ...character, modifiers: setOverride([], t, 5) }, ctx)).not.toThrow();
    }
  });

  it("still refuses a non-set override built by hand, as #171 requires", () => {
    const bad = [
      { id: "x", source: "override", target: "ac", op: "add" as const, value: 2, enabled: true, label: "x" },
    ];
    expect(() => derive({ ...character, modifiers: bad }, ctx)).toThrow(ModifierValidationError);
  });
});
