import { describe, expect, it } from "vitest";
import type { Abil } from "@/features/dnd/db/schema";
import { EMPTY_CONTEXT } from "@/features/dnd/derive/context";
import { derive } from "@/features/dnd/derive/derive";
import { abilities, makeCharacter, makeContext, makeModifier, proficientIn } from "@/features/dnd/derive/fixtures";
import { SKILLS, type Skill } from "@/features/dnd/derive/targets";

describe("skill modifiers", () => {
  // PHB p.174: a skill check is the governing ability's modifier, plus the
  // proficiency bonus if proficient. The 18 governing abilities are asserted
  // in targets.test.ts; here each one is exercised through the engine.
  it.each(Object.entries(SKILLS) as [Skill, Abil][])("%s is the %s modifier when not proficient", (skill, abil) => {
    // 16 in the governing ability is +3; every other ability sits at 10.
    const character = makeCharacter({ abilities: abilities({ [abil]: 16 }) });

    expect(derive(character, EMPTY_CONTEXT).skills[skill]).toBe(3);
  });

  it.each(Object.entries(SKILLS) as [Skill, Abil][])("%s adds proficiency when proficient in it", (skill, abil) => {
    // Level 1, so the proficiency bonus is +2: 3 + 2 = 5.
    const character = makeCharacter({
      abilities: abilities({ [abil]: 16 }),
    });

    expect(derive(character, proficientIn(skill)).skills[skill]).toBe(5);
  });

  it("derives all 18 skills", () => {
    expect(Object.keys(derive(makeCharacter(), EMPTY_CONTEXT).skills)).toHaveLength(18);
  });

  it("leaves the other skills of a governing ability untouched by proficiency in one", () => {
    const character = makeCharacter({
      abilities: abilities({ dex: 16 }),
    });

    const { skills } = derive(character, proficientIn("stealth"));

    expect(skills.stealth).toBe(5);
    expect(skills.acrobatics).toBe(3);
  });

  it("scales proficiency with level", () => {
    // Level 9 is a +4 proficiency bonus (PHB p.15): 3 + 4 = 7.
    const character = makeCharacter({
      level: 9,
      hpRolls: Array(9).fill(6),
      abilities: abilities({ dex: 16 }),
    });

    expect(derive(character, proficientIn("stealth")).skills.stealth).toBe(7);
  });

  it("applies a modifier targeting one skill", () => {
    const character = makeCharacter({
      abilities: abilities({ cha: 14 }),
      modifiers: [
        makeModifier({ target: "skill.persuasion", op: "add", value: 1, source: "item:cloak", label: "Cloak" }),
      ],
    });

    expect(derive(character, EMPTY_CONTEXT).skills.persuasion).toBe(3);
  });

  it("honours an override on a skill", () => {
    const character = makeCharacter({
      abilities: abilities({ dex: 20 }),
      modifiers: [makeModifier({ target: "skill.stealth", op: "set", value: 11, source: "override", label: "Set" })],
    });

    expect(derive(character, EMPTY_CONTEXT).skills.stealth).toBe(11);
  });

  it("explains a skill", () => {
    const character = makeCharacter({
      abilities: abilities({ dex: 16 }),
    });

    // The proficiency is part of the base, not a step: it is not a modifier
    // record, and inventing one would put a record in the trace that nothing
    // in the character's data corresponds to.
    expect(derive(character, proficientIn("stealth")).explain("skill.stealth").base).toBe(5);
  });
});

describe("expertise", () => {
  it("doubles the proficiency bonus", () => {
    // PHB p.96. Expertise is `op:'add'` with `{ref:'proficiencyBonus'}` — not a
    // special doubling operation. DEX 16 (+3) + 2 proficiency + 2 again = 7.
    const character = makeCharacter({
      abilities: abilities({ dex: 16 }),
    });

    expect(
      derive(character, makeContext({ skillProficiencies: ["stealth"], expertise: ["stealth"] })).skills.stealth,
    ).toBe(7);
  });

  it("scales with level, because it is a reference and not a frozen number", () => {
    // Level 17 is a +6 bonus: 3 + 6 + 6 = 15.
    const character = makeCharacter({
      level: 17,
      hpRolls: Array(17).fill(6),
      abilities: abilities({ dex: 16 }),
    });

    expect(
      derive(character, makeContext({ skillProficiencies: ["stealth"], expertise: ["stealth"] })).skills.stealth,
    ).toBe(15);
  });

  it("grants proficiency alongside expertise even if only expertise is listed", () => {
    // Expertise without proficiency is not a state the rules produce; treating
    // the expertise list as implying proficiency means a half-filled record
    // still derives the number the player expects.
    const character = makeCharacter({
      abilities: abilities({ dex: 16 }),
    });

    expect(derive(character, makeContext({ expertise: ["stealth"] })).skills.stealth).toBe(7);
  });

  it("appears in the trace as a reference modifier, not as an invisible doubling", () => {
    // The mechanism matters as much as the number: the sheet must be able to
    // show *why* stealth is 7, and a doubling folded into the base is a step
    // the player cannot see.
    const character = makeCharacter({ abilities: abilities({ dex: 16 }) });

    const trace = derive(character, makeContext({ expertise: ["stealth"] })).explain("skill.stealth");

    expect(trace.base).toBe(5);
    expect(trace.steps).toEqual([
      { id: "expertise:stealth", source: "feature:expertise", label: "Expertise", op: "add", amount: 2, value: 7 },
    ]);
  });
});

describe("saving throws", () => {
  it.each([
    ["str", 16, 3],
    ["dex", 8, -1],
    ["con", 14, 2],
    ["int", 10, 0],
    ["wis", 18, 4],
    ["cha", 6, -2],
  ] as [Abil, number, number][])(
    "%s save is the bare ability modifier without proficiency",
    (abil, score, expected) => {
      const character = makeCharacter({ abilities: abilities({ [abil]: score }) });

      expect(derive(character, EMPTY_CONTEXT).saves[abil]).toBe(expected);
    },
  );

  it("adds the proficiency bonus to a proficient save", () => {
    // A level 1 Fighter is proficient in STR and CON saves. STR 16 → +3 +2 = 5.
    const character = makeCharacter({
      abilities: abilities({ str: 16, con: 14 }),
      proficiencies: {
        skills: [],
        expertise: [],
        saves: ["str", "con"],
        armor: [],
        weapons: [],
        tools: [],
        languages: [],
      },
    });

    const { saves } = derive(character, EMPTY_CONTEXT);

    expect(saves).toEqual({ str: 5, dex: 0, con: 4, int: 0, wis: 0, cha: 0 });
  });

  it("applies a modifier targeting one save", () => {
    // Ring of Protection is +1 to all saves; the SRD has it as prose, so it is
    // six records, one per save — this asserts one of them.
    const character = makeCharacter({
      modifiers: [
        makeModifier({ target: "save.wis", op: "add", value: 1, source: "item:ring-of-protection", label: "Ring" }),
      ],
    });

    expect(derive(character, EMPTY_CONTEXT).saves.wis).toBe(1);
  });

  it("honours an override on a save", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ target: "save.dex", op: "set", value: 9, source: "override", label: "Set" })],
    });

    expect(derive(character, EMPTY_CONTEXT).saves.dex).toBe(9);
  });
});

describe("passive perception", () => {
  it("is 10 plus the perception modifier", () => {
    // PHB p.175. WIS 14 is +2, so 12.
    const character = makeCharacter({ abilities: abilities({ wis: 14 }) });

    expect(derive(character, EMPTY_CONTEXT).passivePerception).toBe(12);
  });

  it("includes proficiency in perception", () => {
    const character = makeCharacter({
      abilities: abilities({ wis: 14 }),
    });

    expect(derive(character, proficientIn("perception")).passivePerception).toBe(14);
  });

  it("includes a modifier targeting the perception skill, because the score follows the skill", () => {
    const character = makeCharacter({
      abilities: abilities({ wis: 14 }),
      modifiers: [
        makeModifier({ target: "skill.perception", op: "add", value: 2, source: "item:goggles", label: "Goggles" }),
      ],
    });

    expect(derive(character, EMPTY_CONTEXT).passivePerception).toBe(14);
  });

  it("takes its own modifiers on top", () => {
    // Observant (+5 passive only) touches the passive score without touching
    // the active check — which is why it is a target of its own.
    const character = makeCharacter({
      abilities: abilities({ wis: 14 }),
      modifiers: [
        makeModifier({
          target: "passivePerception",
          op: "add",
          value: 5,
          source: "feat:observant",
          label: "Observant",
        }),
      ],
    });

    expect(derive(character, EMPTY_CONTEXT).passivePerception).toBe(17);
  });

  it("is 10 for a character with a flat perception modifier of zero", () => {
    expect(derive(makeCharacter(), EMPTY_CONTEXT).passivePerception).toBe(10);
  });
});

describe("spellcasting", () => {
  it("derives the save DC as 8 + proficiency + the spellcasting ability modifier", () => {
    // PHB p.205. A level 1 Wizard with INT 16: 8 + 2 + 3 = 13.
    const character = makeCharacter({ classRef: "catalog:wizard", abilities: abilities({ int: 16 }) });

    expect(derive(character, makeContext({ spellcastingAbility: "int" })).spellSaveDc).toBe(13);
  });

  it("derives the spell attack bonus as proficiency + the spellcasting ability modifier", () => {
    const character = makeCharacter({ classRef: "catalog:wizard", abilities: abilities({ int: 16 }) });

    expect(derive(character, makeContext({ spellcastingAbility: "int" })).spellAttackBonus).toBe(5);
  });

  it("reads the ability from the class rather than assuming one", () => {
    // A level 5 Cleric with WIS 18: DC is 8 + 3 + 4 = 15, attack is 7.
    const character = makeCharacter({
      level: 5,
      hpRolls: Array(5).fill(5),
      classRef: "catalog:cleric",
      abilities: abilities({ wis: 18, int: 8 }),
    });

    const derived = derive(character, makeContext({ spellcastingAbility: "wis" }));

    expect(derived.spellSaveDc).toBe(15);
    expect(derived.spellAttackBonus).toBe(7);
  });

  it("is null for a non-caster rather than a meaningless number", () => {
    // A Fighter has no spell save DC. Reporting 10 would put a number on the
    // sheet that means nothing, and the sheet cannot tell it from a real one.
    const derived = derive(makeCharacter({ classRef: "catalog:fighter" }), EMPTY_CONTEXT);

    expect(derived.spellSaveDc).toBeNull();
    expect(derived.spellAttackBonus).toBeNull();
  });

  it("applies modifiers to the save DC", () => {
    const character = makeCharacter({
      classRef: "catalog:wizard",
      abilities: abilities({ int: 16 }),
      modifiers: [
        makeModifier({
          target: "spell.saveDc",
          op: "add",
          value: 1,
          source: "item:rod-of-the-pact-keeper",
          label: "Rod",
        }),
      ],
    });

    expect(derive(character, makeContext({ spellcastingAbility: "int" })).spellSaveDc).toBe(14);
  });

  it("ignores spell modifiers for a non-caster instead of inventing a value", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ target: "spell.attack", op: "add", value: 1, source: "item:rod", label: "Rod" })],
    });

    expect(derive(character, EMPTY_CONTEXT).spellAttackBonus).toBeNull();
  });
});

describe("advantage and disadvantage", () => {
  it("is not modelled — the target vocabulary has no room for it", () => {
    // CONTEXT.md § Toggle: advantage is a per-roll table decision made with
    // physical dice. Folding a non-numeric concept into a numeric pipeline
    // would force every consumer to handle "a modifier that yields no number".
    const character = makeCharacter({
      modifiers: [makeModifier({ target: "advantage.skill.stealth", op: "add", value: 1 })],
    });

    expect(() => derive(character, EMPTY_CONTEXT)).toThrow(/unknown target/);
  });
});
