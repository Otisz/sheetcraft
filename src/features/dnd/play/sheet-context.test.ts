import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import type { CharacterRecord } from "@/features/dnd/db/schema";
import { makeCharacter } from "@/features/dnd/derive/fixtures";
import { loadDeriveContext } from "@/features/dnd/play/sheet-context";
import { createTestDb, destroyTestDb } from "@/test/db";

/**
 * The context resolution the sheet needs before it can derive anything. Runs
 * against `fake-indexeddb` with the database constructed exactly as production
 * constructs it. See ADR-0002.
 *
 * The catalog rows here are transcribed from the vendored SRD JSON — leather
 * armor genuinely omits `max_bonus`, and the Shield genuinely carries
 * `armor_category: "Shield"` with an additive `base: 2`.
 */

let db: SheetcraftDb;

const LEATHER = {
  index: "leather-armor",
  name: "Leather Armor",
  armor_category: "Light",
  armor_class: { base: 11, dex_bonus: true },
};

const CHAIN_MAIL = {
  index: "chain-mail",
  name: "Chain Mail",
  armor_category: "Heavy",
  armor_class: { base: 16, dex_bonus: false },
};

const SCALE_MAIL = {
  index: "scale-mail",
  name: "Scale Mail",
  armor_category: "Medium",
  armor_class: { base: 14, dex_bonus: true, max_bonus: 2 },
};

const SHIELD = {
  index: "shield",
  name: "Shield",
  armor_category: "Shield",
  armor_class: { base: 2, dex_bonus: false },
};

const LONGSWORD = { index: "longsword", name: "Longsword", weapon_category: "Martial" };

const WIZARD = { index: "wizard", name: "Wizard", spellcasting: { spellcasting_ability: { index: "int" } } };
const BARBARIAN = { index: "barbarian", name: "Barbarian" };

const HUMAN = { index: "human", name: "Human", speed: 30 };
const DWARF = { index: "dwarf", name: "Dwarf", speed: 25 };

const STEALTH = { index: "stealth", name: "Stealth", ability_score: { index: "dex" } };
const PERCEPTION = { index: "perception", name: "Perception", ability_score: { index: "wis" } };

beforeEach(async () => {
  db = createTestDb("sheet-context");
  await Promise.all([
    db.dnd_catalog_equipment.bulkPut([LEATHER, CHAIN_MAIL, SCALE_MAIL, SHIELD, LONGSWORD]),
    db.dnd_catalog_classes.bulkPut([WIZARD, BARBARIAN]),
    db.dnd_catalog_races.bulkPut([HUMAN, DWARF]),
    db.dnd_catalog_skills.bulkPut([STEALTH, PERCEPTION]),
  ]);
});

afterEach(async () => {
  await destroyTestDb(db);
});

/** A character with equipment entries, defaulted to equipped. */
function withEquipment(...items: { index: string; equipped?: boolean }[]): CharacterRecord {
  return makeCharacter({
    equipment: items.map((item) => ({
      itemRef: `catalog:${item.index}` as const,
      quantity: 1,
      equipped: item.equipped ?? true,
    })),
  });
}

describe("armor", () => {
  it("resolves an equipped body armor with its AC block", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "chain-mail" }), db);

    expect(context.armor).toEqual([
      { index: "chain-mail", name: "Chain Mail", base: 16, dexBonus: false, isShield: false },
    ]);
  });

  it("leaves `maxBonus` absent when the SRD omits it — absent means uncapped", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "leather-armor" }), db);

    expect(context.armor[0].maxBonus).toBeUndefined();
  });

  it("carries `maxBonus` when the SRD sets it", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "scale-mail" }), db);

    expect(context.armor[0].maxBonus).toBe(2);
  });

  it("flags a shield from its armor category rather than from its name", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "shield" }), db);

    expect(context.armor[0].isShield).toBe(true);
  });

  it("includes body armor and shield together", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "chain-mail" }, { index: "shield" }), db);

    expect(context.armor.map((one) => one.index)).toEqual(["chain-mail", "shield"]);
  });

  it("ignores unequipped armor — carrying it is not wearing it", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "chain-mail", equipped: false }), db);

    expect(context.armor).toEqual([]);
  });

  it("ignores an equipped item that is not armor", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "longsword" }), db);

    expect(context.armor).toEqual([]);
  });

  it("ignores an equipped item that does not resolve, rather than throwing", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "no-such-item" }), db);

    expect(context.armor).toEqual([]);
  });
});

describe("spellcasting ability", () => {
  it("reads it from the class entry", async () => {
    const character = makeCharacter({ classRef: "catalog:wizard" });

    expect((await loadDeriveContext(character, db)).spellcastingAbility).toBe("int");
  });

  it("is null for a class with no spellcasting block", async () => {
    const character = makeCharacter({ classRef: "catalog:barbarian" });

    expect((await loadDeriveContext(character, db)).spellcastingAbility).toBeNull();
  });

  it("is null for a class ref that does not resolve", async () => {
    const character = makeCharacter({ classRef: "catalog:nonesuch" });

    expect((await loadDeriveContext(character, db)).spellcastingAbility).toBeNull();
  });
});

describe("speed", () => {
  it("reads the race's own speed", async () => {
    const character = makeCharacter({ raceRef: "catalog:dwarf" });

    expect((await loadDeriveContext(character, db)).speed).toBe(25);
  });

  it("falls back to the default when the race ref dangles", async () => {
    const character = makeCharacter({ raceRef: "catalog:nonesuch" });

    expect((await loadDeriveContext(character, db)).speed).toBe(30);
  });
});

describe("skill proficiencies", () => {
  it("resolves stored refs to skill keys the engine understands", async () => {
    const character = makeCharacter({
      proficiencies: { ...makeCharacter().proficiencies, skills: ["catalog:stealth", "catalog:perception"] },
    });

    const context = await loadDeriveContext(character, db);

    expect(context.skillProficiencies).toEqual(["stealth", "perception"]);
  });

  it("resolves expertise the same way", async () => {
    const character = makeCharacter({
      proficiencies: { ...makeCharacter().proficiencies, expertise: ["catalog:stealth"] },
    });

    expect((await loadDeriveContext(character, db)).expertise).toEqual(["stealth"]);
  });

  it("drops a ref that names no skill the engine derives", async () => {
    const character = makeCharacter({
      proficiencies: { ...makeCharacter().proficiencies, skills: ["catalog:stealth", "catalog:basket-weaving"] },
    });

    expect((await loadDeriveContext(character, db)).skillProficiencies).toEqual(["stealth"]);
  });
});
