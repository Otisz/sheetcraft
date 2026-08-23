import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectBackup } from "@/features/dnd/backup/collect";
import { BACKUP_FORMAT, FORMAT_VERSION } from "@/features/dnd/backup/format";
import { createCharacter } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { saveHomebrewEntry } from "@/features/dnd/homebrew/repository";
import { HOMEBREW_TYPE_ORDER } from "@/features/dnd/homebrew/types";
import { createTestDb, destroyTestDb } from "@/test/db";

const RACE = {
  name: "Azureborn",
  speed: 30,
  ability_bonuses: [],
  size: "Medium",
  size_description: "Tall and blue.",
  starting_proficiencies: [],
  languages: [],
  language_desc: "Common.",
  traits: [],
  subraces: [],
  age: "Ages like a human.",
  alignment: "Usually neutral.",
  url: "/api/races/azureborn",
};

const SPELL = {
  name: "Azure Bolt",
  desc: ["A bolt of blue."],
  range: "60 feet",
  components: ["V"],
  ritual: false,
  duration: "Instantaneous",
  concentration: false,
  casting_time: "1 action",
  level: 1,
  school: { index: "evocation", name: "Evocation", url: "/api/magic-schools/evocation" },
  classes: [],
  subclasses: [],
  url: "/api/spells/azure-bolt",
};

let db: SheetcraftDb;

beforeEach(() => {
  db = createTestDb("backup-collect");
});

afterEach(async () => {
  await destroyTestDb(db);
});

describe("collectBackup", () => {
  it("stamps the envelope with the format discriminator and versions", async () => {
    const file = await collectBackup(undefined, db);

    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.formatVersion).toBe(FORMAT_VERSION);
    expect(file.schemaVersion).toBe(1);
    expect(Date.parse(file.exportedAt)).not.toBeNaN();
  });

  it("declares every homebrew type, empties included, so a reader never has to guess", async () => {
    const file = await collectBackup(undefined, db);

    expect(Object.keys(file.homebrew).sort()).toEqual([...HOMEBREW_TYPE_ORDER].sort());
    for (const type of HOMEBREW_TYPE_ORDER) {
      expect(file.homebrew[type]).toEqual([]);
    }
  });

  it("carries every character when no id is given", async () => {
    await createCharacter({ name: "Bruenor", level: 4, classRef: "catalog:fighter", raceRef: "catalog:dwarf" }, db);
    await createCharacter({ name: "Thora", level: 2, classRef: "catalog:cleric", raceRef: "catalog:human" }, db);

    const file = await collectBackup(undefined, db);

    expect(file.characters.map((one) => one.name).sort()).toEqual(["Bruenor", "Thora"]);
  });

  it("carries one character when an id is given", async () => {
    const bruenor = await createCharacter(
      { name: "Bruenor", level: 4, classRef: "catalog:fighter", raceRef: "catalog:dwarf" },
      db,
    );
    await createCharacter({ name: "Thora", level: 2, classRef: "catalog:cleric", raceRef: "catalog:human" }, db);

    const file = await collectBackup(bruenor.id, db);

    expect(file.characters.map((one) => one.name)).toEqual(["Bruenor"]);
  });

  it("is empty, not a failure, for an id that no longer exists", async () => {
    const file = await collectBackup("c_gone", db);

    expect(file.characters).toEqual([]);
  });

  it("embeds only the homebrew the exported characters reference", async () => {
    const saved = await saveHomebrewEntry("races", RACE, undefined, db);
    expect(saved.ok).toBe(true);
    // A second entry nobody points at: a single-character share must not drag
    // the whole library along.
    await saveHomebrewEntry("races", { ...RACE, name: "Unreferenced" }, undefined, db);
    await saveHomebrewEntry("spells", SPELL, undefined, db);

    await createCharacter({ name: "Zephyr", level: 1, classRef: "catalog:wizard", raceRef: "homebrew:azureborn" }, db);

    const file = await collectBackup(undefined, db);

    expect(file.homebrew.races.map((one) => one.index)).toEqual(["azureborn"]);
    expect(file.homebrew.spells).toEqual([]);
  });

  it("embeds homebrew reached through a list field, not just a scalar ref", async () => {
    await saveHomebrewEntry("spells", SPELL, undefined, db);
    const zephyr = await createCharacter(
      { name: "Zephyr", level: 1, classRef: "catalog:wizard", raceRef: "catalog:elf" },
      db,
    );
    await db.dnd_characters.put({
      ...zephyr,
      spells: { known: ["homebrew:azure-bolt"], prepared: [] },
    });

    const file = await collectBackup(undefined, db);

    expect(file.homebrew.spells.map((one) => one.index)).toEqual(["azure-bolt"]);
  });

  it("does not embed catalog refs — they resolve against the importing device's SRD", async () => {
    await db.dnd_catalog_races.put({ index: "dwarf", name: "Dwarf" });
    await createCharacter({ name: "Bruenor", level: 4, classRef: "catalog:fighter", raceRef: "catalog:dwarf" }, db);

    const file = await collectBackup(undefined, db);

    expect(file.homebrew.races).toEqual([]);
  });

  it("drops a dangling homebrew ref rather than embedding a hole", async () => {
    await createCharacter({ name: "Ghost", level: 1, classRef: "catalog:wizard", raceRef: "homebrew:gone" }, db);

    const file = await collectBackup(undefined, db);

    expect(file.homebrew.races).toEqual([]);
    expect(file.characters).toHaveLength(1);
  });
});
