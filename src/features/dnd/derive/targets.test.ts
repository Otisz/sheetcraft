import { describe, expect, it } from "vitest";
import { isReference, isTarget, SKILLS } from "@/features/dnd/derive/targets";

describe("skills", () => {
  it("has the 18 SRD skills", () => {
    expect(Object.keys(SKILLS)).toHaveLength(18);
  });

  // PHB p.174 — each skill's governing ability, transcribed.
  it.each([
    ["athletics", "str"],
    ["acrobatics", "dex"],
    ["sleight-of-hand", "dex"],
    ["stealth", "dex"],
    ["arcana", "int"],
    ["history", "int"],
    ["investigation", "int"],
    ["nature", "int"],
    ["religion", "int"],
    ["animal-handling", "wis"],
    ["insight", "wis"],
    ["medicine", "wis"],
    ["perception", "wis"],
    ["survival", "wis"],
    ["deception", "cha"],
    ["intimidation", "cha"],
    ["performance", "cha"],
    ["persuasion", "cha"],
  ])("%s keys off %s", (skill, abil) => {
    expect(SKILLS[skill as keyof typeof SKILLS]).toBe(abil);
  });

  it("has no CON skill — the SRD has none", () => {
    expect(Object.values(SKILLS)).not.toContain("con");
  });
});

describe("isTarget", () => {
  it.each([
    "ac",
    "maxHp",
    "initiative",
    "speed",
    "proficiencyBonus",
    "passivePerception",
    "spell.saveDc",
    "spell.attack",
    "ability.cha",
    "save.wis",
    "skill.sleight-of-hand",
    "attack.catalog:longsword.hit",
    "attack.dagger.damage",
  ])("accepts %o", (target) => {
    expect(isTarget(target)).toBe(true);
  });

  it.each([
    "",
    "AC",
    "hp",
    "ability.luck",
    "ability.",
    "save.STR",
    "skill.baking",
    "skill",
    "attack.longsword",
    "attack.longsword.crit",
    "attack..hit",
    "spell.saveDC",
    "toString",
    "constructor",
  ])("rejects %o", (target) => {
    expect(isTarget(target)).toBe(false);
  });
});

describe("isReference", () => {
  it.each(["level", "proficiencyBonus", "mod.con", "mod.cha", "score.str"])("accepts %o", (ref) => {
    expect(isReference(ref)).toBe(true);
  });

  it.each(["", "mod.luck", "score.", "MOD.CON", "ac", "maxHp", "mod", "hasOwnProperty"])("rejects %o", (ref) => {
    expect(isReference(ref)).toBe(false);
  });
});
