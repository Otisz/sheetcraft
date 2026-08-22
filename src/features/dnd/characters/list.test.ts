import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listCharacterSummaries } from "@/features/dnd/characters/list";
import { createCharacter } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { createTestDb, destroyTestDb } from "@/test/db";

let db: SheetcraftDb;

const FIGHTER = {
  name: "Bruenor",
  level: 4,
  classRef: "catalog:fighter",
  raceRef: "catalog:dwarf",
} as const;

beforeEach(async () => {
  db = createTestDb("character-list");
  await db.dnd_catalog_classes.bulkPut([{ index: "fighter", name: "Fighter" }]);
  await db.dnd_catalog_races.bulkPut([{ index: "dwarf", name: "Dwarf" }]);
  await db.dnd_homebrew_races.bulkPut([{ index: "azureborn", name: "Azureborn", updatedAt: new Date() }]);
});

afterEach(async () => {
  await destroyTestDb(db);
});

describe("listCharacterSummaries", () => {
  it("is empty before anything is created", async () => {
    await expect(listCharacterSummaries(db)).resolves.toEqual([]);
  });

  it("carries the four fields the row shows", async () => {
    const created = await createCharacter(FIGHTER, db);

    const [summary] = await listCharacterSummaries(db);

    expect(summary).toMatchObject({
      id: created.id,
      name: "Bruenor",
      level: 4,
      className: "Fighter",
      raceName: "Dwarf",
    });
  });

  it("orders most recently updated first", async () => {
    const first = await createCharacter({ ...FIGHTER, name: "First" }, db);
    const second = await createCharacter({ ...FIGHTER, name: "Second" }, db);
    await db.dnd_characters.update(first.id, { updatedAt: new Date(2_000) });
    await db.dnd_characters.update(second.id, { updatedAt: new Date(1_000) });

    const names = (await listCharacterSummaries(db)).map((one) => one.name);

    expect(names).toEqual(["First", "Second"]);
  });

  it("resolves homebrew refs the same as catalog ones", async () => {
    await createCharacter({ ...FIGHTER, raceRef: "homebrew:azureborn" }, db);

    const [summary] = await listCharacterSummaries(db);

    expect(summary.raceName).toBe("Azureborn");
  });

  // A catalog ref can dangle after an upstream re-seed, and that is not the
  // user's doing — the row still renders rather than the list throwing.
  it("falls back to a marked label for a ref that no longer resolves", async () => {
    await createCharacter({ ...FIGHTER, classRef: "catalog:gunslinger" }, db);

    const [summary] = await listCharacterSummaries(db);

    expect(summary.className).toBe("⚠ unknown (gunslinger)");
  });

  it("resolves each distinct ref once, however many characters share it", async () => {
    await createCharacter(FIGHTER, db);
    await createCharacter({ ...FIGHTER, name: "Another" }, db);

    let gets = 0;
    const counting = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "table") {
          return (name: string) => {
            const table = target.table(name);
            return new Proxy(table, {
              get(tableTarget, tableProperty, tableReceiver) {
                if (tableProperty === "get") {
                  gets += 1;
                }
                return Reflect.get(tableTarget, tableProperty, tableReceiver);
              },
            });
          };
        }
        return Reflect.get(target, property, receiver);
      },
    }) as SheetcraftDb;

    await listCharacterSummaries(counting);

    // Two characters, but only one class ref and one race ref between them.
    expect(gets).toBe(2);
  });
});
