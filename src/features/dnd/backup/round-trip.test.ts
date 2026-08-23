import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectBackup } from "@/features/dnd/backup/collect";
import { FORMAT_VERSION } from "@/features/dnd/backup/format";
import { importBackup } from "@/features/dnd/backup/import";
import { parseBackup } from "@/features/dnd/backup/parse";
import { createCharacter, updateCharacter } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import type { CharacterRecord } from "@/features/dnd/db/schema";
import { saveHomebrewEntry } from "@/features/dnd/homebrew/repository";
import { createTestDb, destroyTestDb } from "@/test/db";

/**
 * The round-trip: export → wipe → import → deep equality.
 *
 * ADR-0002 names this the last line of defence against IndexedDB eviction. An
 * export that cannot be re-imported is worse than no export, because it
 * produces false confidence — so this suite goes through the REAL path a file
 * takes, `JSON.stringify` and `parseBackup` included, rather than handing an
 * in-memory object straight to the importer.
 */

const RACE = {
  name: "Azureborn",
  speed: 30,
  ability_bonuses: [{ ability_score: { index: "con", name: "CON", url: "/api/ability-scores/con" }, bonus: 2 }],
  size: "Medium",
  size_description: "Tall and blue.",
  starting_proficiencies: [],
  languages: [],
  language_desc: "Common and Azure.",
  traits: [],
  subraces: [],
  age: "Ages like a human.",
  alignment: "Usually neutral.",
  url: "/api/races/azureborn",
};

let source: SheetcraftDb;
let target: SheetcraftDb;

beforeEach(() => {
  source = createTestDb("round-trip-source");
  target = createTestDb("round-trip-target");
});

afterEach(async () => {
  await destroyTestDb(source);
  await destroyTestDb(target);
});

/** A character with something in every corner of the record, so the equality assertion has teeth. */
async function seedFullCharacter(db: SheetcraftDb): Promise<CharacterRecord> {
  const created = await createCharacter(
    {
      name: "Zephyr",
      level: 5,
      classRef: "catalog:wizard",
      raceRef: "homebrew:azureborn",
      subclassRef: "catalog:evocation",
      backgroundRef: "catalog:sage",
      alignment: "Chaotic Good",
      abilities: { str: 8, dex: 14, con: 13, int: 17, wis: 12, cha: 10 },
      hpRolls: [6, 4, 5, 3, 4],
      modifiers: [
        {
          id: "m_race_con",
          source: "race:azureborn",
          target: "ability.con",
          op: "add",
          value: 2,
          enabled: true,
          label: "Azureborn +2 CON",
        },
      ],
    },
    db,
  );

  const updated = await updateCharacter(
    created.id,
    {
      proficiencies: {
        skills: ["catalog:arcana", "catalog:history"],
        expertise: ["catalog:arcana"],
        saves: ["int", "wis"],
        armor: [],
        weapons: ["catalog:dagger"],
        tools: [],
        languages: ["catalog:common"],
      },
      equipment: [{ itemRef: "catalog:dagger", quantity: 2, equipped: true }],
      spells: { known: ["catalog:magic-missile"], prepared: ["catalog:magic-missile"] },
      play: {
        currentHp: 17,
        tempHp: 4,
        hitDiceSpent: 2,
        deathSaves: { successes: 1, failures: 2 },
        slotsExpended: { 1: 2, 2: 1, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
        currency: { cp: 7, sp: 3, ep: 0, gp: 42, pp: 1 },
        conditions: ["catalog:prone"],
        inspiration: true,
        notes: "Owes the innkeeper.",
      },
    },
    db,
  );

  if (!updated) {
    throw new Error("fixture character vanished");
  }
  return updated;
}

/** Export → serialise → read back, exactly as a file does. */
function throughAFile(file: Awaited<ReturnType<typeof collectBackup>>) {
  const result = parseBackup(JSON.stringify(file));
  if (!result.ok) {
    throw new Error(`round-trip file did not parse: ${result.message}`);
  }
  return result.file;
}

/** Everything except the identity the import deliberately reassigns. */
function withoutCopyIdentity(character: CharacterRecord) {
  const { id: _id, name: _name, updatedAt: _updatedAt, ...rest } = character;
  return rest;
}

describe("backup round-trip", () => {
  it("restores characters and referenced homebrew onto a wiped device", async () => {
    await saveHomebrewEntry("races", RACE, undefined, source);
    const original = await seedFullCharacter(source);

    const file = throughAFile(await collectBackup(undefined, source));

    // The wipe: `target` is a different, empty database — the state a WebKit
    // eviction leaves behind.
    expect(await target.dnd_characters.count()).toBe(0);

    const summary = await importBackup(file, target);
    expect(summary).toEqual({ characters: 1, homebrew: 1 });

    const restored = await target.dnd_characters.toArray();
    expect(restored).toHaveLength(1);
    expect(withoutCopyIdentity(restored[0])).toEqual(withoutCopyIdentity(original));
    expect(restored[0].name).toBe("Zephyr (imported)");
    expect(restored[0].createdAt).toEqual(original.createdAt);

    const homebrew = await target.dnd_homebrew_races.toArray();
    expect(homebrew).toHaveLength(1);
    const { updatedAt: _restoredAt, ...restoredRace } = homebrew[0];
    const { updatedAt: _originalAt, ...originalRace } = (await source.dnd_homebrew_races.toArray())[0];
    expect(restoredRace).toEqual(originalRace);

    // The restored character still points at homebrew that exists.
    expect(restored[0].raceRef).toBe("homebrew:azureborn");
  });

  it("survives a second round-trip, so a backup of a restore is still a backup", async () => {
    await saveHomebrewEntry("races", RACE, undefined, source);
    await seedFullCharacter(source);

    const first = throughAFile(await collectBackup(undefined, source));
    await importBackup(first, target);

    const second = throughAFile(await collectBackup(undefined, target));
    expect(second.characters).toHaveLength(1);
    expect(second.homebrew.races).toHaveLength(1);

    // The suffix is applied once, not compounded into "(imported) (imported)".
    expect(second.characters[0].name).toBe("Zephyr (imported)");
  });

  it("importing a file whose ids already exist creates copies and modifies nothing", async () => {
    await saveHomebrewEntry("races", RACE, undefined, source);
    const original = await seedFullCharacter(source);
    const file = throughAFile(await collectBackup(undefined, source));

    // Importing back into the SAME database — the id collision case.
    await importBackup(file, source);

    const all = await source.dnd_characters.toArray();
    expect(all).toHaveLength(2);

    const kept = await source.dnd_characters.get(original.id);
    expect(kept).toEqual(original);

    const races = await source.dnd_homebrew_races.toArray();
    expect(races.map((one) => one.index).sort()).toEqual(["azureborn", "azureborn-2"]);
    const copy = all.find((one) => one.id !== original.id);
    expect(copy?.raceRef).toBe("homebrew:azureborn-2");
  });

  it("refuses a newer format file and writes nothing", async () => {
    const file = await collectBackup(undefined, source);
    const result = parseBackup(JSON.stringify({ ...file, formatVersion: FORMAT_VERSION + 1 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("newer-format");
    expect(await target.dnd_characters.count()).toBe(0);
  });

  it("migrates an older file forward and imports it", async () => {
    await seedFullCharacter(source);
    const file = await collectBackup(undefined, source);

    const older = {
      ...file,
      schemaVersion: 0,
      characters: file.characters.map((character) => ({ ...character, schemaVersion: 0 })),
    };
    const parsed = parseBackup(JSON.stringify(older));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await importBackup(parsed.file, target);

    const restored = await target.dnd_characters.toArray();
    expect(restored).toHaveLength(1);
    expect(restored[0].schemaVersion).toBe(1);
  });
});
