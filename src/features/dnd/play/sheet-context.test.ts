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

/**
 * Weapons, transcribed from the vendored `equipment.json`. The dagger really
 * does carry `finesse` in its `properties` array and the shortbow really is
 * `weapon_range: "Ranged"` — both are read from those fields rather than from
 * the name.
 */
const LONGSWORD = {
  index: "longsword",
  name: "Longsword",
  equipment_category: { index: "weapon" },
  weapon_category: "Martial",
  weapon_range: "Melee",
  damage: { damage_dice: "1d8", damage_type: { index: "slashing", name: "Slashing" } },
  properties: [{ index: "versatile", name: "Versatile" }],
};

const DAGGER = {
  index: "dagger",
  name: "Dagger",
  equipment_category: { index: "weapon" },
  weapon_category: "Simple",
  weapon_range: "Melee",
  damage: { damage_dice: "1d4", damage_type: { index: "piercing", name: "Piercing" } },
  properties: [
    { index: "finesse", name: "Finesse" },
    { index: "light", name: "Light" },
  ],
};

const SHORTBOW = {
  index: "shortbow",
  name: "Shortbow",
  equipment_category: { index: "weapon" },
  weapon_category: "Simple",
  weapon_range: "Ranged",
  damage: { damage_dice: "1d6", damage_type: { index: "piercing", name: "Piercing" } },
  properties: [{ index: "ammunition", name: "Ammunition" }],
};

/**
 * Weapon proficiency rows, transcribed from the vendored `proficiencies.json`.
 *
 * The shape is the trap here. Upstream carries a **singular `reference`**, not
 * a list of covered weapons — and that reference points at an *equipment
 * category* for a category proficiency (`martial-weapons`) and at a single
 * *equipment* entry for a named one (`longswords`). The `references` array a
 * reasonable person would expect is present on every row and empty on all 117
 * of them, which is exactly how a lookup against it passes a hand-written
 * fixture and matches nothing in production.
 */
const MARTIAL_WEAPONS = {
  index: "martial-weapons",
  name: "Martial Weapons",
  type: "Weapons",
  reference: { index: "martial-weapons", url: "/api/2014/equipment-categories/martial-weapons" },
};

const SIMPLE_WEAPONS = {
  index: "simple-weapons",
  name: "Simple Weapons",
  type: "Weapons",
  reference: { index: "simple-weapons", url: "/api/2014/equipment-categories/simple-weapons" },
};

const LONGSWORDS = {
  index: "longswords",
  name: "Longswords",
  type: "Weapons",
  reference: { index: "longsword", url: "/api/2014/equipment/longsword" },
};

/** The categories those references point at, each listing its weapons. */
const MARTIAL_CATEGORY = {
  index: "martial-weapons",
  name: "Martial Weapons",
  equipment: [{ index: "longsword", name: "Longsword" }],
};

const SIMPLE_CATEGORY = {
  index: "simple-weapons",
  name: "Simple Weapons",
  equipment: [
    { index: "dagger", name: "Dagger" },
    { index: "shortbow", name: "Shortbow" },
  ],
};

const WIZARD = {
  index: "wizard",
  name: "Wizard",
  hit_die: 6,
  spellcasting: { spellcasting_ability: { index: "int" } },
};
const BARBARIAN = { index: "barbarian", name: "Barbarian", hit_die: 12 };

/**
 * Level rows, transcribed from the vendored `levels.json`. The wizard's row
 * genuinely stores explicit zeroes for levels 3–9, which is what the slot
 * resolution drops.
 */
const WIZARD_3 = {
  index: "wizard-3",
  level: 3,
  class: { index: "wizard" },
  spellcasting: {
    cantrips_known: 3,
    spell_slots_level_1: 4,
    spell_slots_level_2: 2,
    spell_slots_level_3: 0,
    spell_slots_level_4: 0,
    spell_slots_level_5: 0,
    spell_slots_level_6: 0,
    spell_slots_level_7: 0,
    spell_slots_level_8: 0,
    spell_slots_level_9: 0,
  },
};

const BARBARIAN_3 = { index: "barbarian-3", level: 3, class: { index: "barbarian" } };

const HUMAN = { index: "human", name: "Human", speed: 30 };
const DWARF = { index: "dwarf", name: "Dwarf", speed: 25 };

const STEALTH = { index: "stealth", name: "Stealth", ability_score: { index: "dex" } };
const PERCEPTION = { index: "perception", name: "Perception", ability_score: { index: "wis" } };

beforeEach(async () => {
  db = createTestDb("sheet-context");
  await Promise.all([
    db.dnd_catalog_equipment.bulkPut([LEATHER, CHAIN_MAIL, SCALE_MAIL, SHIELD, LONGSWORD, DAGGER, SHORTBOW]),
    db.dnd_catalog_classes.bulkPut([WIZARD, BARBARIAN]),
    db.dnd_catalog_races.bulkPut([HUMAN, DWARF]),
    db.dnd_catalog_skills.bulkPut([STEALTH, PERCEPTION]),
    db.dnd_catalog_levels.bulkPut([WIZARD_3, BARBARIAN_3]),
    db.dnd_catalog_proficiencies.bulkPut([MARTIAL_WEAPONS, SIMPLE_WEAPONS, LONGSWORDS]),
    db.dnd_catalog_equipment_categories.bulkPut([MARTIAL_CATEGORY, SIMPLE_CATEGORY]),
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

describe("hit die", () => {
  it("reads the class's own hit die", async () => {
    const character = makeCharacter({ classRef: "catalog:barbarian" });

    expect((await loadDeriveContext(character, db)).hitDie).toBe(12);
  });

  it("leaves it absent when the class ref does not resolve, so the engine falls back", async () => {
    const character = makeCharacter({ classRef: "catalog:no-such-class" });

    expect((await loadDeriveContext(character, db)).hitDie).toBeUndefined();
  });
});

describe("weapons", () => {
  it("resolves a carried weapon with its damage and properties", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "longsword" }), db);

    expect(context.weapons).toEqual([
      {
        index: "longsword",
        name: "Longsword",
        damageDice: "1d8",
        damageType: "Slashing",
        finesse: false,
        ranged: false,
        proficient: false,
      },
    ]);
  });

  it("includes a carried but unequipped weapon — a sheathed sword is still an attack", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "longsword", equipped: false }), db);

    expect(context.weapons?.map((weapon) => weapon.index)).toEqual(["longsword"]);
  });

  it("reads finesse from the properties array rather than from the name", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "dagger" }), db);

    expect(context.weapons?.[0].finesse).toBe(true);
  });

  it("reads ranged from the weapon range", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "shortbow" }), db);

    expect(context.weapons?.[0].ranged).toBe(true);
  });

  it("marks a weapon the character is proficient with", async () => {
    const base = makeCharacter();
    const character = makeCharacter({
      equipment: [{ itemRef: "catalog:longsword", quantity: 1, equipped: true }],
      proficiencies: { ...base.proficiencies, weapons: ["catalog:martial-weapons"] },
    });

    expect((await loadDeriveContext(character, db)).weapons?.[0].proficient).toBe(true);
  });

  it("leaves a weapon outside the character's proficiencies unmarked", async () => {
    const base = makeCharacter();
    const character = makeCharacter({
      equipment: [{ itemRef: "catalog:longsword", quantity: 1, equipped: true }],
      proficiencies: { ...base.proficiencies, weapons: ["catalog:simple-weapons"] },
    });

    expect((await loadDeriveContext(character, db)).weapons?.[0].proficient).toBe(false);
  });

  it("matches a category proficiency through the equipment category it references", async () => {
    // `martial-weapons` covers the longsword by way of the category, which is
    // the only place upstream lists the weapons a category contains.
    const base = makeCharacter();
    const character = makeCharacter({
      equipment: [{ itemRef: "catalog:longsword", quantity: 1, equipped: true }],
      proficiencies: { ...base.proficiencies, weapons: ["catalog:martial-weapons"] },
    });

    expect((await loadDeriveContext(character, db)).weapons?.[0].proficient).toBe(true);
  });

  it("matches a proficiency naming the single weapon rather than a category", async () => {
    const base = makeCharacter();
    const character = makeCharacter({
      equipment: [{ itemRef: "catalog:longsword", quantity: 1, equipped: true }],
      proficiencies: { ...base.proficiencies, weapons: ["catalog:longswords"] },
    });

    expect((await loadDeriveContext(character, db)).weapons?.[0].proficient).toBe(true);
  });

  it("ignores a carried item that is not a weapon", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "chain-mail" }), db);

    expect(context.weapons).toEqual([]);
  });

  it("ignores a carried item that does not resolve, rather than throwing", async () => {
    const context = await loadDeriveContext(withEquipment({ index: "no-such-item" }), db);

    expect(context.weapons).toEqual([]);
  });
});

describe("spell slots", () => {
  it("reads the slot table for the character's class and level", async () => {
    const character = makeCharacter({ classRef: "catalog:wizard", level: 3, hpRolls: [6, 4, 4] });

    const context = await loadDeriveContext(character, db);

    expect(context.slotsByLevel).toEqual({ 1: 4, 2: 2 });
  });

  it("drops the levels the SRD stores as an explicit zero", async () => {
    const character = makeCharacter({ classRef: "catalog:wizard", level: 3, hpRolls: [6, 4, 4] });

    const context = await loadDeriveContext(character, db);

    expect(Object.keys(context.slotsByLevel ?? {})).toEqual(["1", "2"]);
  });

  it("reads the cantrips the class knows", async () => {
    const character = makeCharacter({ classRef: "catalog:wizard", level: 3, hpRolls: [6, 4, 4] });

    expect((await loadDeriveContext(character, db)).cantripsKnown).toBe(3);
  });

  it("has no slots for a class whose level row carries no spellcasting block", async () => {
    const character = makeCharacter({ classRef: "catalog:barbarian", level: 3, hpRolls: [12, 7, 7] });

    const context = await loadDeriveContext(character, db);

    expect(context.slotsByLevel).toBeUndefined();
    expect(context.cantripsKnown).toBe(0);
  });

  it("has no slots when the level row does not exist", async () => {
    const character = makeCharacter({ classRef: "catalog:wizard", level: 17, hpRolls: Array(17).fill(4) });

    expect((await loadDeriveContext(character, db)).slotsByLevel).toBeUndefined();
  });
});
