/**
 * Attack derivation, against weapons transcribed from the vendored
 * `equipment.json` rather than invented. Every expected number here comes from
 * PHB p.194 ("Melee Attacks", "Ranged Attacks") and p.195 ("Finesse"), not from
 * running the engine.
 */
import { describe, expect, it } from "vitest";
import { EMPTY_CONTEXT } from "@/features/dnd/derive/context";
import { derive } from "@/features/dnd/derive/derive";
import { abilities, makeCharacter, makeContext, makeModifier, WEAPONS } from "@/features/dnd/derive/fixtures";

describe("attack to-hit", () => {
  it("uses STR for a melee weapon", () => {
    // STR 16 is +3, and the character is not proficient: +3.
    const character = makeCharacter({ abilities: abilities({ str: 16 }) });

    const [attack] = derive(character, makeContext({ weapons: [WEAPONS.longsword] })).attacks;

    expect(attack.toHit).toBe(3);
  });

  it("adds the proficiency bonus when proficient with the weapon", () => {
    // Level 1 proficiency is +2: 3 + 2 = 5.
    const character = makeCharacter({ abilities: abilities({ str: 16 }) });
    const context = makeContext({ weapons: [{ ...WEAPONS.longsword, proficient: true }] });

    expect(derive(character, context).attacks[0].toHit).toBe(5);
  });

  it("uses DEX for a ranged weapon", () => {
    // DEX 18 is +4; STR is 10, so a STR-keyed reading would show +0.
    const character = makeCharacter({ abilities: abilities({ dex: 18, str: 10 }) });

    const [attack] = derive(character, makeContext({ weapons: [WEAPONS.shortbow] })).attacks;

    expect(attack.toHit).toBe(4);
    expect(attack.ability).toBe("dex");
  });

  it("takes the better ability for a finesse weapon", () => {
    // PHB p.195: finesse lets you *choose*, so the sheet shows the better one.
    // DEX 18 (+4) beats STR 12 (+1).
    const character = makeCharacter({ abilities: abilities({ str: 12, dex: 18 }) });

    const [attack] = derive(character, makeContext({ weapons: [WEAPONS.dagger] })).attacks;

    expect(attack.ability).toBe("dex");
    expect(attack.toHit).toBe(4);
  });

  it("takes STR for a finesse weapon when STR is the better score", () => {
    const character = makeCharacter({ abilities: abilities({ str: 18, dex: 12 }) });

    const [attack] = derive(character, makeContext({ weapons: [WEAPONS.dagger] })).attacks;

    expect(attack.ability).toBe("str");
    expect(attack.toHit).toBe(4);
  });

  it("applies a modifier targeting this weapon's to-hit", () => {
    const character = makeCharacter({
      abilities: abilities({ str: 16 }),
      modifiers: [
        makeModifier({
          target: "attack.longsword.hit",
          op: "add",
          value: 1,
          source: "item:longsword-1",
          label: "+1 Longsword",
        }),
      ],
    });

    expect(derive(character, makeContext({ weapons: [WEAPONS.longsword] })).attacks[0].toHit).toBe(4);
  });

  it("leaves another weapon's to-hit untouched", () => {
    const character = makeCharacter({
      abilities: abilities({ str: 16, dex: 16 }),
      modifiers: [makeModifier({ target: "attack.longsword.hit", op: "add", value: 1, source: "item:x", label: "+1" })],
    });
    const context = makeContext({ weapons: [WEAPONS.longsword, WEAPONS.shortbow] });

    const { attacks } = derive(character, context);

    expect(attacks[0].toHit).toBe(4);
    expect(attacks[1].toHit).toBe(3);
  });
});

describe("attack damage", () => {
  it("carries the weapon's dice and adds the ability modifier", () => {
    const character = makeCharacter({ abilities: abilities({ str: 16 }) });

    const [attack] = derive(character, makeContext({ weapons: [WEAPONS.longsword] })).attacks;

    expect(attack.damageDice).toBe("1d8");
    expect(attack.damageBonus).toBe(3);
    expect(attack.damageType).toBe("Slashing");
  });

  it("never adds the proficiency bonus to damage", () => {
    // PHB p.194: proficiency applies to the attack roll, not the damage roll.
    const character = makeCharacter({ abilities: abilities({ str: 16 }) });
    const context = makeContext({ weapons: [{ ...WEAPONS.longsword, proficient: true }] });

    expect(derive(character, context).attacks[0].damageBonus).toBe(3);
  });

  it("uses the same ability for damage as for the attack roll", () => {
    // A finesse weapon resolved to DEX adds the DEX modifier to damage too.
    const character = makeCharacter({ abilities: abilities({ str: 12, dex: 18 }) });

    expect(derive(character, makeContext({ weapons: [WEAPONS.dagger] })).attacks[0].damageBonus).toBe(4);
  });

  it("applies a modifier targeting this weapon's damage", () => {
    const character = makeCharacter({
      abilities: abilities({ str: 16 }),
      modifiers: [
        makeModifier({ target: "attack.longsword.damage", op: "add", value: 2, source: "item:x", label: "+2" }),
      ],
    });

    expect(derive(character, makeContext({ weapons: [WEAPONS.longsword] })).attacks[0].damageBonus).toBe(5);
  });

  it("carries a negative damage bonus rather than flooring it", () => {
    // STR 6 is -2. A weak character genuinely does 1d8-2; the rules floor the
    // *total damage dealt* at 0, which is a roll-time concern, not a sheet one.
    const character = makeCharacter({ abilities: abilities({ str: 6 }) });

    expect(derive(character, makeContext({ weapons: [WEAPONS.longsword] })).attacks[0].damageBonus).toBe(-2);
  });
});

describe("attacks list", () => {
  it("is empty for a character carrying no weapons", () => {
    expect(derive(makeCharacter(), EMPTY_CONTEXT).attacks).toEqual([]);
  });

  it("keeps the order the weapons arrived in", () => {
    const context = makeContext({ weapons: [WEAPONS.shortbow, WEAPONS.longsword, WEAPONS.dagger] });

    expect(derive(makeCharacter(), context).attacks.map((attack) => attack.index)).toEqual([
      "shortbow",
      "longsword",
      "dagger",
    ]);
  });

  it("carries the weapon's name for display", () => {
    const [attack] = derive(makeCharacter(), makeContext({ weapons: [WEAPONS.longsword] })).attacks;

    expect(attack.name).toBe("Longsword");
  });
});
