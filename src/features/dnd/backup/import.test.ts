import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectBackup } from "@/features/dnd/backup/collect";
import type { BackupFile } from "@/features/dnd/backup/format";
import { importBackup } from "@/features/dnd/backup/import";
import { createCharacter } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { saveHomebrewEntry } from "@/features/dnd/homebrew/repository";
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

let db: SheetcraftDb;

beforeEach(() => {
  db = createTestDb("backup-import");
});

afterEach(async () => {
  await destroyTestDb(db);
});

/** A backup built from a throwaway source database, as an export really is. */
async function backupOf(build: (source: SheetcraftDb) => Promise<void>): Promise<BackupFile> {
  const source = createTestDb("backup-import-source");
  try {
    await build(source);
    return await collectBackup(undefined, source);
  } finally {
    await destroyTestDb(source);
  }
}

describe("importBackup", () => {
  it("writes characters into an empty database", async () => {
    const file = await backupOf(async (source) => {
      await createCharacter(
        { name: "Bruenor", level: 4, classRef: "catalog:fighter", raceRef: "catalog:dwarf" },
        source,
      );
    });

    const result = await importBackup(file, db);

    expect(result.characters).toBe(1);
    const stored = await db.dnd_characters.toArray();
    // Suffixed unconditionally, not only on a name collision: an import is
    // always a copy, and a copy that looks like the original is the thing the
    // never-overwrite rule exists to avoid.
    expect(stored.map((one) => one.name)).toEqual(["Bruenor (imported)"]);
  });

  it("gives every imported character a fresh id, so nothing existing is overwritten", async () => {
    const original = await createCharacter(
      { name: "Bruenor", level: 4, classRef: "catalog:fighter", raceRef: "catalog:dwarf" },
      db,
    );
    const file = await collectBackup(undefined, db);

    await importBackup(file, db);

    const stored = await db.dnd_characters.toArray();
    expect(stored).toHaveLength(2);
    const copy = stored.find((one) => one.id !== original.id);
    expect(copy?.id).not.toBe(original.id);
    // Nothing about the original moved.
    const kept = await db.dnd_characters.get(original.id);
    expect(kept?.name).toBe("Bruenor");
    expect(kept?.updatedAt).toEqual(original.updatedAt);
  });

  it("suffixes an imported name with (imported), so the copy is visible", async () => {
    await createCharacter({ name: "Bruenor", level: 4, classRef: "catalog:fighter", raceRef: "catalog:dwarf" }, db);
    const file = await collectBackup(undefined, db);

    await importBackup(file, db);

    const names = (await db.dnd_characters.toArray()).map((one) => one.name).sort();
    expect(names).toEqual(["Bruenor", "Bruenor (imported)"]);
  });

  it("imports homebrew under a free slug and repoints the characters at it", async () => {
    const file = await backupOf(async (source) => {
      await saveHomebrewEntry("races", RACE, undefined, source);
      await createCharacter(
        { name: "Zephyr", level: 1, classRef: "catalog:wizard", raceRef: "homebrew:azureborn" },
        source,
      );
    });
    // The importing device already has a DIFFERENT Azureborn.
    await saveHomebrewEntry("races", { ...RACE, size_description: "A local one." }, undefined, db);

    const result = await importBackup(file, db);

    expect(result.homebrew).toBe(1);
    const races = await db.dnd_homebrew_races.toArray();
    expect(races.map((one) => one.index).sort()).toEqual(["azureborn", "azureborn-2"]);
    // The local entry is untouched...
    expect((await db.dnd_homebrew_races.get("azureborn"))?.size_description).toBe("A local one.");
    // ...and the imported character follows its own copy.
    const zephyr = await db.dnd_characters.toArray();
    expect(zephyr[0].raceRef).toBe("homebrew:azureborn-2");
  });

  it("leaves catalog refs alone — they resolve against this device's SRD", async () => {
    const file = await backupOf(async (source) => {
      await createCharacter(
        { name: "Bruenor", level: 4, classRef: "catalog:fighter", raceRef: "catalog:dwarf" },
        source,
      );
    });

    await importBackup(file, db);

    const stored = await db.dnd_characters.toArray();
    expect(stored[0].raceRef).toBe("catalog:dwarf");
    expect(stored[0].classRef).toBe("catalog:fighter");
  });

  it("writes nothing at all when one entry fails mid-import", async () => {
    const file = await backupOf(async (source) => {
      await saveHomebrewEntry("races", RACE, undefined, source);
      await createCharacter(
        { name: "Zephyr", level: 1, classRef: "catalog:wizard", raceRef: "homebrew:azureborn" },
        source,
      );
    });
    // A homebrew entry that its own vendored schema rejects.
    file.homebrew.races[0] = { ...file.homebrew.races[0], speed: "fast" as unknown as number };

    await expect(importBackup(file, db)).rejects.toThrow();

    expect(await db.dnd_characters.count()).toBe(0);
    expect(await db.dnd_homebrew_races.count()).toBe(0);
  });

  it("reports what it wrote, so the user can be told before and after", async () => {
    const file = await backupOf(async (source) => {
      await saveHomebrewEntry("races", RACE, undefined, source);
      await createCharacter(
        { name: "Zephyr", level: 1, classRef: "catalog:wizard", raceRef: "homebrew:azureborn" },
        source,
      );
      await createCharacter({ name: "Thora", level: 2, classRef: "catalog:cleric", raceRef: "catalog:human" }, source);
    });

    const result = await importBackup(file, db);

    expect(result).toEqual({ characters: 2, homebrew: 1 });
  });
});
