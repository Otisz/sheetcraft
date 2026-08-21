import { describe, expect, it } from "vitest";
import { derive } from "@/features/dnd/derive/derive";
import { ARMOR, abilities, makeCharacter, makeContext, makeModifier } from "@/features/dnd/derive/fixtures";

/**
 * The eight AC computations validated in the modifier-record prototype
 * (#143), transcribed with their expected values. These are the cases the
 * model was accepted on; if any regresses, the model is wrong, not the test.
 */
describe("armor class — the eight validated cases", () => {
  it("Fighter in chain mail with a shield is 18", () => {
    // Chain mail is base 16 and takes no dex. The shield's `base: 2` is
    // additive, so it lands as a step rather than replacing the base.
    const character = makeCharacter({ abilities: abilities({ dex: 12 }) });

    const derived = derive(character, makeContext({ armor: [ARMOR.chainMail, ARMOR.shield] }));

    expect(derived.armorClass).toBe(18);
    expect(derived.explain("ac").base).toBe(16);
    expect(derived.explain("ac").steps.map((step) => [step.source, step.amount])).toEqual([["equip:shield", 2]]);
  });

  it("Barbarian L1, DEX 14 CON 16, Unarmored Defense on, is 15", () => {
    // 10 + 2 dex = 12, then +3 CON from the feature. The feature is a modifier
    // record with a reference value — a frozen 3 would go stale when CON does.
    const character = makeCharacter({
      abilities: abilities({ dex: 14, con: 16 }),
      modifiers: [
        makeModifier({
          target: "ac",
          op: "add",
          value: { ref: "mod.con" },
          source: "feature:barbarian-unarmored-defense",
          label: "Unarmored Defense",
        }),
      ],
    });

    const derived = derive(character, makeContext({ armor: [] }));

    expect(derived.armorClass).toBe(15);
  });

  it("the same Barbarian in chain mail with Unarmored Defense toggled off is 16", () => {
    // The toggle is the player's, not the engine's: a disabled record
    // contributes nothing, and chain mail's 16 stands alone.
    const character = makeCharacter({
      abilities: abilities({ dex: 14, con: 16 }),
      modifiers: [
        makeModifier({
          target: "ac",
          op: "add",
          value: { ref: "mod.con" },
          source: "feature:barbarian-unarmored-defense",
          label: "Unarmored Defense",
          enabled: false,
        }),
      ],
    });

    const derived = derive(character, makeContext({ armor: [ARMOR.chainMail] }));

    expect(derived.armorClass).toBe(16);
  });

  it("Monk L1 unarmored, DEX 16 WIS 14, with a +1 ring is 16", () => {
    // 10 + 3 dex = 13, +2 WIS, +1 ring. Magic item bonuses are prose-only in
    // the SRD, so the ring is a hand-created record like any homebrew one.
    const character = makeCharacter({
      abilities: abilities({ dex: 16, wis: 14 }),
      modifiers: [
        makeModifier({
          target: "ac",
          op: "add",
          value: { ref: "mod.wis" },
          source: "feature:monk-unarmored-defense",
          label: "Unarmored Defense",
        }),
        makeModifier({ target: "ac", op: "add", value: 1, source: "item:ring-of-protection", label: "Ring +1" }),
      ],
    });

    const derived = derive(character, makeContext({ armor: [] }));

    expect(derived.armorClass).toBe(16);
  });

  it("Monk L5 unarmored, DEX 16 WIS 16, is 16", () => {
    // The same monk one WIS bracket up: 13 base, +3. The reference is why this
    // moves without anyone editing the record.
    const character = makeCharacter({
      level: 5,
      abilities: abilities({ dex: 16, wis: 16 }),
      modifiers: [
        makeModifier({
          target: "ac",
          op: "add",
          value: { ref: "mod.wis" },
          source: "feature:monk-unarmored-defense",
          label: "Unarmored Defense",
        }),
      ],
    });

    const derived = derive(character, makeContext({ armor: [] }));

    expect(derived.armorClass).toBe(16);
  });

  it("Rogue in leather armor with DEX 18 is 15 — light armor's dex is uncapped", () => {
    // The trap: upstream OMITS `max_bonus` on light armor rather than nulling
    // it. Absent must mean unlimited; reading it as 0 costs four points here.
    const character = makeCharacter({ abilities: abilities({ dex: 18 }) });

    const derived = derive(character, makeContext({ armor: [ARMOR.leather] }));

    expect(derived.armorClass).toBe(15);
  });

  it("Cleric in scale mail with DEX 18 and a shield is 18 — medium armor caps dex at 2", () => {
    // 14 + min(4, 2) = 16, then +2 shield.
    const character = makeCharacter({ abilities: abilities({ dex: 18 }) });

    const derived = derive(character, makeContext({ armor: [ARMOR.scaleMail, ARMOR.shield] }));

    expect(derived.armorClass).toBe(18);
  });

  it("an override beats everything", () => {
    const character = makeCharacter({
      abilities: abilities({ dex: 18 }),
      modifiers: [makeModifier({ target: "ac", op: "set", value: 21, source: "override", label: "Override" })],
    });

    const derived = derive(character, makeContext({ armor: [ARMOR.scaleMail, ARMOR.shield] }));

    expect(derived.armorClass).toBe(21);
  });
});

describe("armor class — the base formula", () => {
  it("is 10 + dex with nothing equipped", () => {
    const character = makeCharacter({ abilities: abilities({ dex: 14 }) });

    expect(derive(character, makeContext({ armor: [] })).armorClass).toBe(12);
  });

  it("applies a negative dex modifier when unarmored", () => {
    const character = makeCharacter({ abilities: abilities({ dex: 6 }) });

    expect(derive(character, makeContext({ armor: [] })).armorClass).toBe(8);
  });

  it("ignores dex entirely on armor that does not take it", () => {
    const character = makeCharacter({ abilities: abilities({ dex: 18 }) });

    expect(derive(character, makeContext({ armor: [ARMOR.chainMail] })).armorClass).toBe(16);
  });

  it("does not raise a capped dex bonus above the cap", () => {
    const character = makeCharacter({ abilities: abilities({ dex: 20 }) });

    expect(derive(character, makeContext({ armor: [ARMOR.scaleMail] })).armorClass).toBe(16);
  });

  it("applies a negative dex modifier under a cap — the cap is a ceiling, not a floor", () => {
    // min(-2, 2) is -2. A cap that clamped upward would hand a clumsy cleric
    // two points of AC the rules do not give them.
    const character = makeCharacter({ abilities: abilities({ dex: 6 }) });

    expect(derive(character, makeContext({ armor: [ARMOR.scaleMail] })).armorClass).toBe(12);
  });

  it("uses ability scores after `ability.*` modifiers, not the base scores", () => {
    // A +2 racial DEX on a 15 makes 17, which is +3 AC unarmored, not +2.
    const character = makeCharacter({
      abilities: abilities({ dex: 15 }),
      modifiers: [makeModifier({ target: "ability.dex", op: "add", value: 2, source: "race:elf" })],
    });

    expect(derive(character, makeContext({ armor: [] })).armorClass).toBe(13);
  });
});

describe("armor class — shields", () => {
  it("adds a shield on top of unarmored AC", () => {
    const character = makeCharacter({ abilities: abilities({ dex: 14 }) });

    expect(derive(character, makeContext({ armor: [ARMOR.shield] })).armorClass).toBe(14);
  });

  it("never treats a shield as the base armor", () => {
    // The Shield's `base: 2` read as absolute would produce 2, not 14.
    const character = makeCharacter({ abilities: abilities({ dex: 14 }) });

    expect(derive(character, makeContext({ armor: [ARMOR.shield] })).explain("ac").base).toBe(12);
  });
});
