import { describe, expect, it } from "vitest";
import { EMPTY_CONTEXT } from "@/features/dnd/derive/context";
import { derive } from "@/features/dnd/derive/derive";
import { abilities, makeCharacter, makeModifier } from "@/features/dnd/derive/fixtures";

describe("ability modifiers", () => {
  // PHB p.13, the full published table. Transcribed, not computed.
  it.each([
    [1, -5],
    [2, -4],
    [3, -4],
    [4, -3],
    [5, -3],
    [6, -2],
    [7, -2],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [13, 1],
    [14, 2],
    [15, 2],
    [16, 3],
    [17, 3],
    [18, 4],
    [19, 4],
    [20, 5],
    [30, 10],
  ])("score %i gives modifier %i", (score, expected) => {
    const character = makeCharacter({ abilities: abilities({ str: score }) });

    expect(derive(character, EMPTY_CONTEXT).abilityModifiers.str).toBe(expected);
  });

  it("derives all six independently", () => {
    const character = makeCharacter({
      abilities: { str: 8, dex: 14, con: 15, int: 12, wis: 20, cha: 3 },
    });

    expect(derive(character, EMPTY_CONTEXT).abilityModifiers).toEqual({
      str: -1,
      dex: 2,
      con: 2,
      int: 1,
      wis: 5,
      cha: -4,
    });
  });

  it("applies modifiers targeting an ability score before taking the modifier", () => {
    // A +2 racial STR bonus on a 15 makes 17, which is +3 — not +2 plus something.
    const character = makeCharacter({
      abilities: abilities({ str: 15 }),
      modifiers: [makeModifier({ target: "ability.str", op: "add", value: 2, source: "race:half-orc" })],
    });

    const derived = derive(character, EMPTY_CONTEXT);

    expect(derived.abilityScores.str).toBe(17);
    expect(derived.abilityModifiers.str).toBe(3);
  });
});

describe("proficiency bonus", () => {
  // PHB p.15. Never read from a catalog — derived as 2 + floor((level-1)/4).
  it.each([
    [1, 2],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ])("level %i gives +%i", (level, expected) => {
    const character = makeCharacter({ level, hpRolls: Array(level).fill(1) });

    expect(derive(character, EMPTY_CONTEXT).proficiencyBonus).toBe(expected);
  });

  it("can be modified, so a homebrew feature can touch it", () => {
    const character = makeCharacter({
      level: 5,
      hpRolls: [1, 1, 1, 1, 1],
      modifiers: [makeModifier({ target: "proficiencyBonus", op: "add", value: 1 })],
    });

    expect(derive(character, EMPTY_CONTEXT).proficiencyBonus).toBe(4);
  });
});

describe("max HP", () => {
  it("is the sum of the rolls plus CON modifier per level", () => {
    // Level 3 fighter, rolls 10/6/7, CON 16 (+3): 23 + 9 = 32.
    const character = makeCharacter({
      level: 3,
      hpRolls: [10, 6, 7],
      abilities: abilities({ con: 16 }),
    });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(32);
  });

  it("recomputes when CON changes — the reason hpRolls is an array, not a total", () => {
    const base = makeCharacter({ level: 3, hpRolls: [10, 6, 7], abilities: abilities({ con: 16 }) });
    const afterAsi = makeCharacter({ level: 3, hpRolls: [10, 6, 7], abilities: abilities({ con: 18 }) });

    expect(derive(base, EMPTY_CONTEXT).maxHp).toBe(32);
    expect(derive(afterAsi, EMPTY_CONTEXT).maxHp).toBe(35);
  });

  it("recomputes when CON changes via a modifier, not just the base score", () => {
    const character = makeCharacter({
      level: 3,
      hpRolls: [10, 6, 7],
      abilities: abilities({ con: 16 }),
      modifiers: [makeModifier({ target: "ability.con", op: "add", value: 2, source: "item:amulet" })],
    });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(35);
  });

  it("subtracts for a negative CON modifier", () => {
    // Level 2, rolls 6/4, CON 8 (-1): 10 - 2 = 8.
    const character = makeCharacter({ level: 2, hpRolls: [6, 4], abilities: abilities({ con: 8 }) });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(8);
  });

  it("never falls below 1, however punishing the CON", () => {
    // A dwarf-less level 1 with a roll of 1 and CON 3 (-4) would be -3.
    // Sheetcraft's floor, not the SRD's — the 2014 rules state no minimum.
    const character = makeCharacter({ level: 1, hpRolls: [1], abilities: abilities({ con: 3 }) });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(1);
  });

  it("shows the floor as a trace step, so the steps still explain the value", () => {
    const character = makeCharacter({ level: 1, hpRolls: [1], abilities: abilities({ con: 3 }) });

    const trace = derive(character, EMPTY_CONTEXT).explain("maxHp");

    expect(trace.value).toBe(1);
    expect(trace.base).toBe(-3);
    expect(trace.steps.at(-1)).toMatchObject({ source: "rule", amount: 1, value: 1 });
  });

  it("leaves the trace alone when the floor does not bite", () => {
    const character = makeCharacter({ level: 1, hpRolls: [10], abilities: abilities({ con: 14 }) });

    expect(derive(character, EMPTY_CONTEXT).explain("maxHp").steps).toEqual([]);
  });

  it("accepts a modifier from a feature like Tough or Draconic Resilience", () => {
    const character = makeCharacter({
      level: 3,
      hpRolls: [10, 6, 7],
      abilities: abilities({ con: 16 }),
      modifiers: [makeModifier({ target: "maxHp", op: "add", value: 6, source: "feature:tough" })],
    });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(38);
  });
});

describe("phased resolution", () => {
  const phased = [
    makeModifier({ id: "a", target: "maxHp", op: "add", value: 5 }),
    makeModifier({ id: "s", target: "maxHp", op: "set", value: 20 }),
    makeModifier({ id: "n", target: "maxHp", op: "min", value: 30 }),
    makeModifier({ id: "x", target: "maxHp", op: "max", value: 10 }),
  ];

  it("runs set before add, then min, then max", () => {
    // set 20 → add 5 = 25 → floor of 30 raises to 30 → ceiling of 10 caps at 10.
    const character = makeCharacter({ modifiers: phased });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(10);
  });

  it("gives the same result whatever order the records are stored in", () => {
    const permutations = [
      [phased[0], phased[1], phased[2], phased[3]],
      [phased[3], phased[2], phased[1], phased[0]],
      [phased[2], phased[0], phased[3], phased[1]],
      [phased[1], phased[3], phased[0], phased[2]],
    ];

    const results = permutations.map((modifiers) => derive(makeCharacter({ modifiers }), EMPTY_CONTEXT).maxHp);

    expect(results).toEqual([10, 10, 10, 10]);
  });

  it("names the bound, not the function: min is a floor and max is a ceiling", () => {
    // The SRD reading — "your AC can't be less than 12" is a min of 12. A min
    // below the value and a max above it are both no-ops.
    const base = makeCharacter({});

    const floorRaises = makeCharacter({ modifiers: [makeModifier({ target: "maxHp", op: "min", value: 25 })] });
    const floorIdle = makeCharacter({ modifiers: [makeModifier({ target: "maxHp", op: "min", value: 4 })] });
    const ceilingCaps = makeCharacter({ modifiers: [makeModifier({ target: "maxHp", op: "max", value: 6 })] });
    const ceilingIdle = makeCharacter({ modifiers: [makeModifier({ target: "maxHp", op: "max", value: 40 })] });

    expect(derive(base, EMPTY_CONTEXT).maxHp).toBe(10);
    expect(derive(floorRaises, EMPTY_CONTEXT).maxHp).toBe(25);
    expect(derive(floorIdle, EMPTY_CONTEXT).maxHp).toBe(10);
    expect(derive(ceilingCaps, EMPTY_CONTEXT).maxHp).toBe(6);
    expect(derive(ceilingIdle, EMPTY_CONTEXT).maxHp).toBe(10);
  });

  it("takes the last set when several compete, since set is not commutative", () => {
    const character = makeCharacter({
      modifiers: [
        makeModifier({ id: "first", target: "maxHp", op: "set", value: 20 }),
        makeModifier({ id: "second", target: "maxHp", op: "set", value: 30 }),
      ],
    });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(30);
  });

  it("stacks two adds from different sources", () => {
    const character = makeCharacter({
      modifiers: [
        makeModifier({ id: "one", target: "maxHp", op: "add", value: 3, source: "feature:tough" }),
        makeModifier({ id: "two", target: "maxHp", op: "add", value: 2, source: "item:ring" }),
      ],
    });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(15);
  });

  it("ignores a disabled modifier — the Toggle", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ target: "maxHp", op: "add", value: 100, enabled: false })],
    });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(10);
  });
});

describe("override", () => {
  it("short-circuits every other phase", () => {
    const character = makeCharacter({
      modifiers: [
        makeModifier({ id: "a", target: "maxHp", op: "add", value: 5 }),
        makeModifier({ id: "s", target: "maxHp", op: "set", value: 20 }),
        makeModifier({ id: "n", target: "maxHp", op: "min", value: 50 }),
        makeModifier({ id: "o", target: "maxHp", op: "set", value: 7, source: "override" }),
      ],
    });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(7);
  });

  it("wins wherever it sits in the record order", () => {
    const override = makeModifier({ id: "o", target: "maxHp", op: "set", value: 7, source: "override" });
    const other = makeModifier({ id: "a", target: "maxHp", op: "add", value: 5 });

    expect(derive(makeCharacter({ modifiers: [override, other] }), EMPTY_CONTEXT).maxHp).toBe(7);
    expect(derive(makeCharacter({ modifiers: [other, override] }), EMPTY_CONTEXT).maxHp).toBe(7);
  });

  it("rejects an override that is not a set, rather than quietly treating it as one", () => {
    // CONTEXT.md § Override defines an override as `source:'override', op:'set'`.
    const character = makeCharacter({
      modifiers: [makeModifier({ id: "bad-override", target: "maxHp", op: "add", value: 5, source: "override" })],
    });

    expect(() => derive(character, EMPTY_CONTEXT)).toThrow(/override must use op "set"/);
  });

  it("is ignored when toggled off, leaving the derived value", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ target: "maxHp", op: "set", value: 7, source: "override", enabled: false })],
    });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(10);
  });
});

describe("reference values", () => {
  it("resolves mod.con against live character state", () => {
    // Unarmored Defense is +CON, not a frozen integer.
    const character = makeCharacter({
      abilities: abilities({ con: 16 }),
      modifiers: [makeModifier({ target: "maxHp", op: "add", value: { ref: "mod.con" } })],
    });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(16);
  });

  it("goes with the ability when it changes", () => {
    const modifiers = [makeModifier({ target: "maxHp", op: "add", value: { ref: "mod.wis" } })];
    const low = makeCharacter({ abilities: abilities({ wis: 10 }), modifiers });
    const high = makeCharacter({ abilities: abilities({ wis: 18 }), modifiers });

    expect(derive(high, EMPTY_CONTEXT).maxHp - derive(low, EMPTY_CONTEXT).maxHp).toBe(4);
  });

  it("resolves proficiencyBonus", () => {
    const character = makeCharacter({
      level: 9,
      hpRolls: Array(9).fill(1),
      modifiers: [makeModifier({ target: "maxHp", op: "add", value: { ref: "proficiencyBonus" } })],
    });

    // 9 rolls of 1, CON 10 (+0), plus a proficiency bonus of 4.
    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(13);
  });

  it("resolves level", () => {
    const character = makeCharacter({
      level: 5,
      hpRolls: Array(5).fill(2),
      modifiers: [makeModifier({ target: "maxHp", op: "add", value: { ref: "level" } })],
    });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(15);
  });

  it("resolves an ability score as well as its modifier", () => {
    const character = makeCharacter({
      abilities: abilities({ str: 17 }),
      modifiers: [makeModifier({ target: "maxHp", op: "add", value: { ref: "score.str" } })],
    });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(27);
  });
});

describe("validation", () => {
  it("rejects an unknown target rather than silently ignoring it", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ id: "bad", target: "armour-class", op: "add", value: 2 })],
    });

    expect(() => derive(character, EMPTY_CONTEXT)).toThrow(/armour-class/);
  });

  it("rejects an unknown target even when the modifier is disabled", () => {
    // A typo that only surfaces when the player flips the toggle is a trap.
    const character = makeCharacter({
      modifiers: [makeModifier({ target: "skill.stelth", op: "add", value: 2, enabled: false })],
    });

    expect(() => derive(character, EMPTY_CONTEXT)).toThrow(/skill\.stelth/);
  });

  it("rejects an unknown reference", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ target: "maxHp", op: "add", value: { ref: "mod.luck" } })],
    });

    expect(() => derive(character, EMPTY_CONTEXT)).toThrow(/mod\.luck/);
  });

  it("names the offending modifier so the error is actionable", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ id: "mod-42", target: "nonsense", op: "add", value: 1, source: "homebrew:x" })],
    });

    expect(() => derive(character, EMPTY_CONTEXT)).toThrow(/mod-42/);
  });

  it("accepts every target in the closed vocabulary", () => {
    const character = makeCharacter({
      modifiers: [
        makeModifier({ target: "ac" }),
        makeModifier({ target: "maxHp" }),
        makeModifier({ target: "proficiencyBonus" }),
        makeModifier({ target: "passivePerception" }),
        makeModifier({ target: "spell.saveDc" }),
        makeModifier({ target: "spell.attack" }),
        makeModifier({ target: "ability.str" }),
        makeModifier({ target: "save.dex" }),
        makeModifier({ target: "skill.stealth" }),
        makeModifier({ target: "skill.animal-handling" }),
        makeModifier({ target: "attack.longsword.hit" }),
        makeModifier({ target: "attack.longsword.damage" }),
      ],
    });

    expect(() => derive(character, EMPTY_CONTEXT)).not.toThrow();
  });

  it("rejects a skill outside the 18", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ target: "skill.baking", op: "add", value: 2 })],
    });

    expect(() => derive(character, EMPTY_CONTEXT)).toThrow(/skill\.baking/);
  });
});

describe("provenance", () => {
  it("explains a value as a base plus each contributing modifier", () => {
    const character = makeCharacter({
      level: 3,
      hpRolls: [10, 6, 7],
      abilities: abilities({ con: 16 }),
      modifiers: [makeModifier({ id: "tough", target: "maxHp", op: "add", value: 6, source: "feature:tough" })],
    });

    const trace = derive(character, EMPTY_CONTEXT).explain("maxHp");

    expect(trace.value).toBe(38);
    expect(trace.base).toBe(32);
    expect(trace.steps).toEqual([
      { id: "tough", source: "feature:tough", label: "Test modifier", op: "add", amount: 6, value: 38 },
    ]);
  });

  it("records the resolved amount of a reference, not the reference itself", () => {
    const character = makeCharacter({
      abilities: abilities({ con: 16 }),
      modifiers: [
        makeModifier({ id: "ud", target: "maxHp", op: "add", value: { ref: "mod.con" }, source: "feature:x" }),
      ],
    });

    // Base is 10 (one roll) + 3 (CON 16 at level 1) = 13; the reference adds 3 more.
    expect(derive(character, EMPTY_CONTEXT).explain("maxHp").steps[0]).toMatchObject({ amount: 3, value: 16 });
  });

  it("lists the steps in resolution order, not record order", () => {
    const character = makeCharacter({
      modifiers: [
        makeModifier({ id: "a", target: "maxHp", op: "add", value: 5 }),
        makeModifier({ id: "s", target: "maxHp", op: "set", value: 20 }),
      ],
    });

    expect(
      derive(character, EMPTY_CONTEXT)
        .explain("maxHp")
        .steps.map((step) => step.id),
    ).toEqual(["s", "a"]);
  });

  it("shows an override as the only step, since it short-circuits", () => {
    const character = makeCharacter({
      modifiers: [
        makeModifier({ id: "a", target: "maxHp", op: "add", value: 5 }),
        makeModifier({ id: "o", target: "maxHp", op: "set", value: 7, source: "override" }),
      ],
    });

    const trace = derive(character, EMPTY_CONTEXT).explain("maxHp");

    expect(trace.value).toBe(7);
    expect(trace.steps.map((step) => step.id)).toEqual(["o"]);
  });

  it("omits disabled modifiers from the trace", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ id: "off", target: "maxHp", op: "add", value: 5, enabled: false })],
    });

    expect(derive(character, EMPTY_CONTEXT).explain("maxHp").steps).toEqual([]);
  });

  it("explains a value with no modifiers as its bare base", () => {
    const trace = derive(makeCharacter({ level: 5, hpRolls: Array(5).fill(1) }), EMPTY_CONTEXT).explain(
      "proficiencyBonus",
    );

    expect(trace).toMatchObject({ base: 3, value: 3, steps: [] });
  });
});

describe("purity", () => {
  it("does not mutate the character it is given", () => {
    const character = makeCharacter({
      abilities: abilities({ con: 16 }),
      modifiers: [makeModifier({ target: "ability.con", op: "add", value: 2 })],
    });
    const before = structuredClone(character);

    derive(character, EMPTY_CONTEXT);

    expect(character).toEqual(before);
  });

  it("returns the same values for the same input", () => {
    const character = makeCharacter({ level: 7, hpRolls: [10, 6, 7, 5, 8, 4, 6], abilities: abilities({ con: 14 }) });

    expect(derive(character, EMPTY_CONTEXT).maxHp).toBe(derive(character, EMPTY_CONTEXT).maxHp);
  });
});
