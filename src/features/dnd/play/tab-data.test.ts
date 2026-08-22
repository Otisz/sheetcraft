/**
 * The catalog resolution the tabs need: display names for every ref they show,
 * and the class and race feature prose the Features tab expands.
 *
 * Runs against `fake-indexeddb` with the database constructed exactly as
 * production constructs it, like `sheet-context.test.ts`. See ADR-0002.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { makeCharacter } from "@/features/dnd/derive/fixtures";
import { loadTabData } from "@/features/dnd/play/tab-data";
import { createTestDb, destroyTestDb } from "@/test/db";

let db: SheetcraftDb;

const BARBARIAN = { index: "barbarian", name: "Barbarian" };
/**
 * Races carry their languages inline — there is no `languages` catalog table in
 * the upstream pin, which is what makes the language lookup a special case.
 */
const HUMAN = {
  index: "human",
  name: "Human",
  speed: 30,
  languages: [{ index: "common", name: "Common" }],
};
const ACOLYTE = { index: "acolyte", name: "Acolyte" };
const BERSERKER = { index: "berserker", name: "Path of the Berserker", class: { index: "barbarian" } };

const RAGE = {
  index: "rage",
  name: "Rage",
  level: 1,
  class: { index: "barbarian" },
  desc: ["In battle, you fight with primal ferocity.", "Your rage lasts for 1 minute."],
};
const RECKLESS = {
  index: "reckless-attack",
  name: "Reckless Attack",
  level: 2,
  class: { index: "barbarian" },
  desc: ["You can throw aside all concern for defense."],
};
const FRENZY = {
  index: "frenzy",
  name: "Frenzy",
  level: 3,
  class: { index: "barbarian" },
  subclass: { index: "berserker" },
  desc: ["You can go into a frenzy when you rage."],
};
const SNEAK_ATTACK = {
  index: "sneak-attack",
  name: "Sneak Attack",
  level: 1,
  class: { index: "rogue" },
  desc: ["You know how to strike subtly."],
};

const DARKVISION = {
  index: "darkvision",
  name: "Darkvision",
  races: [{ index: "human" }],
  subraces: [],
  desc: ["You can see in dim light within 60 feet."],
};
const DWARVEN_RESILIENCE = {
  index: "dwarven-resilience",
  name: "Dwarven Resilience",
  races: [{ index: "dwarf" }],
  subraces: [],
  desc: ["You have advantage on saving throws against poison."],
};

const LONGSWORD = { index: "longsword", name: "Longsword" };
const ROPE = { index: "rope-hempen-50-feet", name: "Rope, Hempen (50 feet)" };
const MAGIC_MISSILE = { index: "magic-missile", name: "Magic Missile", level: 1 };
const MARTIAL_WEAPONS = { index: "martial-weapons", name: "Martial Weapons" };

beforeEach(async () => {
  db = createTestDb("tab-data");
  await Promise.all([
    db.dnd_catalog_classes.bulkPut([BARBARIAN]),
    db.dnd_catalog_subclasses.bulkPut([BERSERKER]),
    db.dnd_catalog_races.bulkPut([HUMAN]),
    db.dnd_catalog_backgrounds.bulkPut([ACOLYTE]),
    db.dnd_catalog_features.bulkPut([RAGE, RECKLESS, FRENZY, SNEAK_ATTACK]),
    db.dnd_catalog_traits.bulkPut([DARKVISION, DWARVEN_RESILIENCE]),
    db.dnd_catalog_equipment.bulkPut([LONGSWORD, ROPE]),
    db.dnd_catalog_spells.bulkPut([MAGIC_MISSILE]),
    db.dnd_catalog_proficiencies.bulkPut([MARTIAL_WEAPONS]),
  ]);
});

afterEach(async () => {
  await destroyTestDb(db);
});

/** A barbarian 3 of the Berserker path — the fixture most cases build on. */
function barbarian(overrides: Parameters<typeof makeCharacter>[0] = {}) {
  return makeCharacter({
    classRef: "catalog:barbarian",
    subclassRef: "catalog:berserker",
    raceRef: "catalog:human",
    level: 3,
    hpRolls: [12, 7, 7],
    ...overrides,
  });
}

describe("display names", () => {
  it("names a carried item", async () => {
    const character = barbarian({
      equipment: [{ itemRef: "catalog:longsword", quantity: 1, equipped: true }],
    });

    const data = await loadTabData(character, db);

    expect(data.names["catalog:longsword"]).toBe("Longsword");
  });

  it("names a spell", async () => {
    const character = barbarian({ spells: { known: ["catalog:magic-missile"], prepared: [] } });

    expect((await loadTabData(character, db)).names["catalog:magic-missile"]).toBe("Magic Missile");
  });

  it("names a proficiency", async () => {
    const base = makeCharacter();
    const character = barbarian({
      proficiencies: { ...base.proficiencies, weapons: ["catalog:martial-weapons"] },
    });

    expect((await loadTabData(character, db)).names["catalog:martial-weapons"]).toBe("Martial Weapons");
  });

  it("names the class, subclass, race and background", async () => {
    const character = barbarian({ backgroundRef: "catalog:acolyte" });

    const { names } = await loadTabData(character, db);

    expect(names["catalog:barbarian"]).toBe("Barbarian");
    expect(names["catalog:berserker"]).toBe("Path of the Berserker");
    expect(names["catalog:human"]).toBe("Human");
    expect(names["catalog:acolyte"]).toBe("Acolyte");
  });

  it("leaves a dangling ref unnamed rather than throwing", async () => {
    // The caller renders the miss as `⚠ unknown (<index>)`, which is what the
    // rest of the app does with a ref that outlived a re-seed.
    const character = barbarian({
      equipment: [{ itemRef: "catalog:no-such-item", quantity: 1, equipped: false }],
    });

    const data = await loadTabData(character, db);

    expect(data.names["catalog:no-such-item"]).toBeUndefined();
  });
});

describe("language names", () => {
  it("names a language from the race's own list", async () => {
    // Languages are NOT a catalog table — upstream has no `languages` type, and
    // each race carries its own inline. Resolving them through `proficiencies`
    // would miss every time, which is what the ⚠ marker would then show.
    const base = makeCharacter();
    const character = barbarian({
      proficiencies: { ...base.proficiencies, languages: ["catalog:common"] },
    });

    expect((await loadTabData(character, db)).names["catalog:common"]).toBe("Common");
  });

  it("falls back to the index title-cased when no race declares it", async () => {
    // A language chosen from a background is not on the race's list, and it is
    // still a language the player picked. `Elvish` beats `⚠ unknown (elvish)`.
    const base = makeCharacter();
    const character = barbarian({
      proficiencies: { ...base.proficiencies, languages: ["catalog:elvish"] },
    });

    expect((await loadTabData(character, db)).names["catalog:elvish"]).toBe("Elvish");
  });

  it("title-cases a multi-word index", async () => {
    const base = makeCharacter();
    const character = barbarian({
      proficiencies: { ...base.proficiencies, languages: ["catalog:deep-speech"] },
    });

    expect((await loadTabData(character, db)).names["catalog:deep-speech"]).toBe("Deep Speech");
  });
});

describe("class features", () => {
  it("lists the features the character's level has unlocked", async () => {
    const data = await loadTabData(barbarian(), db);

    expect(data.classFeatures.map((feature) => feature.index)).toEqual(["rage", "reckless-attack", "frenzy"]);
  });

  it("excludes a feature from a level the character has not reached", async () => {
    const data = await loadTabData(barbarian({ level: 1, hpRolls: [12] }), db);

    expect(data.classFeatures.map((feature) => feature.index)).toEqual(["rage"]);
  });

  it("excludes another class's features", async () => {
    const data = await loadTabData(barbarian(), db);

    expect(data.classFeatures.map((feature) => feature.index)).not.toContain("sneak-attack");
  });

  it("excludes a subclass feature when the character has a different subclass", async () => {
    const data = await loadTabData(barbarian({ subclassRef: null }), db);

    expect(data.classFeatures.map((feature) => feature.index)).toEqual(["rage", "reckless-attack"]);
  });

  it("orders them by the level they were gained at", async () => {
    expect((await loadTabData(barbarian(), db)).classFeatures.map((feature) => feature.level)).toEqual([1, 2, 3]);
  });

  it("carries the prose the tab expands", async () => {
    const [rage] = (await loadTabData(barbarian(), db)).classFeatures;

    expect(rage.name).toBe("Rage");
    expect(rage.description).toEqual(["In battle, you fight with primal ferocity.", "Your rage lasts for 1 minute."]);
  });
});

describe("race features", () => {
  it("lists the traits of the character's race", async () => {
    const data = await loadTabData(barbarian(), db);

    expect(data.raceFeatures.map((feature) => feature.index)).toEqual(["darkvision"]);
  });

  it("excludes another race's traits", async () => {
    const data = await loadTabData(barbarian(), db);

    expect(data.raceFeatures.map((feature) => feature.index)).not.toContain("dwarven-resilience");
  });

  it("carries the prose", async () => {
    const [darkvision] = (await loadTabData(barbarian(), db)).raceFeatures;

    expect(darkvision.name).toBe("Darkvision");
    expect(darkvision.description).toEqual(["You can see in dim light within 60 feet."]);
  });

  it("is empty when the race ref does not resolve, rather than throwing", async () => {
    const data = await loadTabData(barbarian({ raceRef: "catalog:no-such-race" }), db);

    expect(data.raceFeatures).toEqual([]);
  });
});
