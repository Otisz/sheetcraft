import { describe, expect, it } from "vitest";
import { floatingBonusChoices, type RacialSource, racialModifiers } from "@/features/dnd/creation/racial-bonuses";

/**
 * Racial bonuses become MODIFIER RECORDS, never baked into the stored scores.
 * That is what lets a race change swap records cleanly and lets the sheet
 * explain why CON is 16. See CONTEXT.md § Input vs derived.
 *
 * The entries here are trimmed transcriptions of the SRD rows, so the
 * expected records are read off the rulebook rather than off the code.
 */

const DWARF: RacialSource = {
  ref: "catalog:dwarf",
  name: "Dwarf",
  ability_bonuses: [{ ability_score: { index: "con" }, bonus: 2 }],
};

const HILL_DWARF: RacialSource = {
  ref: "catalog:hill-dwarf",
  name: "Hill Dwarf",
  ability_bonuses: [{ ability_score: { index: "wis" }, bonus: 1 }],
};

const HALF_ELF: RacialSource = {
  ref: "catalog:half-elf",
  name: "Half-Elf",
  ability_bonuses: [{ ability_score: { index: "cha" }, bonus: 2 }],
  ability_bonus_options: {
    choose: 2,
    from: {
      option_set_type: "options_array",
      options: ["str", "dex", "con", "int", "wis"].map((index) => ({
        option_type: "ability_bonus",
        ability_score: { index },
        bonus: 1,
      })),
    },
  },
};

describe("racialModifiers", () => {
  it("turns a race's fixed bonus into an add against ability.<abil>", () => {
    const modifiers = racialModifiers({ race: DWARF });

    expect(modifiers).toHaveLength(1);
    expect(modifiers[0]).toMatchObject({
      source: "race:catalog:dwarf",
      target: "ability.con",
      op: "add",
      value: 2,
      enabled: true,
      label: "Dwarf +2 CON",
    });
  });

  it("emits the subrace's bonus alongside the race's, each traceable to its own source", () => {
    const modifiers = racialModifiers({ race: DWARF, subrace: HILL_DWARF });

    expect(modifiers.map((one) => [one.source, one.target, one.value])).toEqual([
      ["race:catalog:dwarf", "ability.con", 2],
      ["race:catalog:hill-dwarf", "ability.wis", 1],
    ]);
  });

  it("emits the two Half-Elf floating +1s as records of their own", () => {
    const modifiers = racialModifiers({ race: HALF_ELF, floating: ["str", "dex"] });

    expect(modifiers.map((one) => [one.target, one.value])).toEqual([
      ["ability.cha", 2],
      ["ability.str", 1],
      ["ability.dex", 1],
    ]);
    expect(modifiers[1].label).toBe("Half-Elf +1 STR");
  });

  it("gives every record a distinct, stable id — a re-render must not renumber them", () => {
    const first = racialModifiers({ race: HALF_ELF, floating: ["str", "dex"] });
    const second = racialModifiers({ race: HALF_ELF, floating: ["str", "dex"] });

    expect(first.map((one) => one.id)).toEqual(second.map((one) => one.id));
    expect(new Set(first.map((one) => one.id)).size).toBe(first.length);
  });

  it("emits nothing for a race with no bonuses at all", () => {
    expect(racialModifiers({ race: { ref: "homebrew:azureborn", name: "Azureborn", ability_bonuses: [] } })).toEqual(
      [],
    );
  });

  it("ignores a floating pick the race did not ask for", () => {
    expect(racialModifiers({ race: DWARF, floating: ["str"] })).toHaveLength(1);
  });
});

describe("floatingBonusChoices", () => {
  it("asks Half-Elf for exactly two picks, from the five non-CHA abilities", () => {
    const choice = floatingBonusChoices(HALF_ELF);

    expect(choice).toEqual({ choose: 2, bonus: 1, from: ["str", "dex", "con", "int", "wis"] });
  });

  it("asks nothing of a race without floating bonuses", () => {
    expect(floatingBonusChoices(DWARF)).toBeNull();
  });

  it("asks nothing of no race at all", () => {
    expect(floatingBonusChoices(null)).toBeNull();
  });
});
