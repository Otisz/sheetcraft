import { describe, expect, it } from "vitest";
import { abilityMethodDefaults } from "@/features/dnd/creation/abilities";
import {
  buildCreateInput,
  type CreationDraft,
  draftIssues,
  emptyDraft,
  isDraftValid,
  MAX_LEVEL,
  MIN_LEVEL,
  setAbilityMethod,
  setLevel,
  setRace,
} from "@/features/dnd/creation/draft";
import type { RacialSource } from "@/features/dnd/creation/racial-bonuses";

const HALF_ELF: RacialSource = {
  ref: "catalog:half-elf",
  name: "Half-Elf",
  ability_bonuses: [{ ability_score: { index: "cha" }, bonus: 2 }],
  ability_bonus_options: {
    choose: 2,
    from: {
      option_set_type: "options_array",
      options: ["str", "dex"].map((index) => ({ option_type: "ability_bonus", ability_score: { index }, bonus: 1 })),
    },
  },
};

/** A draft that submits cleanly — each test spoils exactly one thing about it. */
function validDraft(overrides: Partial<CreationDraft> = {}): CreationDraft {
  return {
    ...emptyDraft(),
    name: "Bruenor",
    classRef: "catalog:fighter",
    raceRef: "catalog:dwarf",
    level: 1,
    abilityMethod: "manual",
    abilities: { str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 },
    ...overrides,
  };
}

/** Which rules a draft trips, as codes — the message text is the form's business. */
function codes(draft: CreationDraft, context: Parameters<typeof draftIssues>[1] = {}) {
  return draftIssues(draft, context).map((issue) => issue.code);
}

describe("draftIssues", () => {
  it("passes a complete draft", () => {
    expect(draftIssues(validDraft())).toEqual([]);
    expect(isDraftValid(validDraft())).toBe(true);
  });

  it("blocks an empty name, and a name that is only whitespace", () => {
    expect(codes(validDraft({ name: "" }))).toContain("name");
    expect(codes(validDraft({ name: "   " }))).toContain("name");
  });

  it("blocks an unset class or race", () => {
    expect(codes(validDraft({ classRef: null }))).toContain("class");
    expect(codes(validDraft({ raceRef: null }))).toContain("race");
  });

  it.each([0, -1, 21, 1.5])("blocks level %s, outside 1–20", (level) => {
    expect(codes(validDraft({ level }))).toContain("level");
  });

  it("blocks a cleared level field, which reaches the draft as NaN", () => {
    expect(codes(validDraft({ level: Number.NaN }))).toContain("level");
  });

  it.each([MIN_LEVEL, MAX_LEVEL])("accepts level %i", (level) => {
    expect(codes(validDraft({ level }))).not.toContain("level");
  });

  it("blocks a missing subclass at or above the threshold, and does not below it", () => {
    const fighter = validDraft({ level: 3, subclassRef: null });
    expect(codes(fighter, { subclassLevel: 3 })).toContain("subclass");
    expect(codes(validDraft({ level: 2, subclassRef: null }), { subclassLevel: 3 })).not.toContain("subclass");
  });

  it("does not block on a subclass for a class that never picks one", () => {
    expect(codes(validDraft({ level: 20 }), { subclassLevel: null })).not.toContain("subclass");
  });

  it("blocks an incomplete standard array", () => {
    const draft = validDraft({
      abilityMethod: "standard-array",
      abilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: null },
    });
    expect(codes(draft)).toContain("abilities");
  });

  it("blocks an over-budget point buy, and allows the full 27", () => {
    const over = validDraft({
      abilityMethod: "point-buy",
      abilities: { str: 15, dex: 15, con: 15, int: 15, wis: 15, cha: 15 },
    });
    expect(codes(over)).toContain("abilities");

    const exact = validDraft({
      abilityMethod: "point-buy",
      abilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    });
    expect(codes(exact)).not.toContain("abilities");
  });

  it("names a blank score as blank, not as over-budget — the message must match the fault", () => {
    const draft = validDraft({
      abilityMethod: "point-buy",
      abilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: null },
    });

    const issue = draftIssues(draft).find((one) => one.code === "abilities");
    expect(issue?.message).toMatch(/needs a score/i);
    expect(issue?.message).not.toMatch(/budget/i);
  });

  it("allows an under-spent point-buy budget — leftover points are legal", () => {
    const draft = validDraft({
      abilityMethod: "point-buy",
      abilities: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    });
    expect(codes(draft)).not.toContain("abilities");
  });

  it("blocks unallocated floating racial bonuses", () => {
    const draft = validDraft({ raceRef: "catalog:half-elf", floating: ["str"] });
    expect(codes(draft, { race: HALF_ELF })).toContain("floating");

    const allocated = validDraft({ raceRef: "catalog:half-elf", floating: ["str", "dex"] });
    expect(codes(allocated, { race: HALF_ELF })).not.toContain("floating");
  });

  it("blocks the same ability picked twice for a floating bonus", () => {
    const draft = validDraft({ raceRef: "catalog:half-elf", floating: ["str", "str"] });
    expect(codes(draft, { race: HALF_ELF })).toContain("floating");
  });

  it("reports every broken rule at once, not just the first", () => {
    expect(codes(validDraft({ name: "", classRef: null, level: 0 }))).toEqual(
      expect.arrayContaining(["name", "class", "level"]),
    );
  });

  it("raises no balance warning for a wildly strong manual spread — that is not the app's business", () => {
    const draft = validDraft({
      abilityMethod: "manual",
      abilities: { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 },
    });
    expect(draftIssues(draft)).toEqual([]);
  });
});

describe("setLevel", () => {
  it("keeps a chosen subclass when the level drops below the threshold — the field hides, the value stays", () => {
    const draft = validDraft({ level: 3, subclassRef: "catalog:champion" });
    expect(setLevel(draft, 1).subclassRef).toBe("catalog:champion");
  });

  it("does not block submission on a subclass that is merely hidden", () => {
    const draft = setLevel(validDraft({ level: 3, subclassRef: "catalog:champion" }), 1);
    expect(codes(draft, { subclassLevel: 3 })).toEqual([]);
  });
});

describe("setAbilityMethod", () => {
  it("resets the spread to the new method's defaults rather than clamping the old one", () => {
    const manual = validDraft({
      abilityMethod: "manual",
      abilities: { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 },
    });
    const switched = setAbilityMethod(manual, "point-buy");

    expect(switched.abilityMethod).toBe("point-buy");
    expect(switched.abilities).toEqual(abilityMethodDefaults("point-buy"));
  });

  it("leaves the spread untouched when the method has not actually changed", () => {
    const draft = validDraft();
    expect(setAbilityMethod(draft, "manual").abilities).toEqual(draft.abilities);
  });
});

describe("setRace", () => {
  it("clears the subrace when the race changes — a hill dwarf is not an elf's subrace", () => {
    const draft = validDraft({ raceRef: "catalog:dwarf", subraceRef: "catalog:hill-dwarf" });
    expect(setRace(draft, "catalog:elf").subraceRef).toBeNull();
  });

  it("keeps the subrace when the same race is re-picked", () => {
    const draft = validDraft({ raceRef: "catalog:dwarf", subraceRef: "catalog:hill-dwarf" });
    expect(setRace(draft, "catalog:dwarf").subraceRef).toBe("catalog:hill-dwarf");
  });
});

describe("buildCreateInput", () => {
  it("stores the abilities exactly as entered — racial bonuses stay out of the scores", () => {
    const draft = validDraft({
      raceRef: "catalog:dwarf",
      abilities: { str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 },
    });
    const built = buildCreateInput(draft, {
      race: { ref: "catalog:dwarf", name: "Dwarf", ability_bonuses: [{ ability_score: { index: "con" }, bonus: 2 }] },
    });

    expect(built?.abilities).toEqual({ str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 });
    expect(built?.modifiers?.map((one) => [one.target, one.value])).toEqual([["ability.con", 2]]);
  });

  it("trims the name", () => {
    expect(buildCreateInput(validDraft({ name: "  Bruenor  " }))?.name).toBe("Bruenor");
  });

  it("carries a hidden subclass through to the record — the value was kept, so it is stored", () => {
    const draft = validDraft({ level: 1, subclassRef: "catalog:champion" });
    expect(buildCreateInput(draft)?.subclassRef).toBe("catalog:champion");
  });

  it("refuses to build from an invalid draft", () => {
    expect(buildCreateInput(validDraft({ name: "" }))).toBeNull();
  });
});
