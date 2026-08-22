import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCharacter } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import {
  deleteHomebrewEntry,
  getHomebrewEntry,
  listHomebrewEntries,
  listHomebrewLibrary,
  saveHomebrewEntry,
} from "@/features/dnd/homebrew/repository";
import { createTestDb, destroyTestDb } from "@/test/db";

const SUBRACE = {
  name: "Azure Dwarf",
  race: { index: "dwarf", name: "Dwarf", url: "/api/races/dwarf" },
  desc: "Dwarves of the deep blue.",
  ability_bonuses: [{ ability_score: { index: "con", name: "CON", url: "/api/ability-scores/con" }, bonus: 2 }],
  url: "/api/subraces/azure-dwarf",
};

let db: SheetcraftDb;

beforeEach(() => {
  db = createTestDb("homebrew-repository");
});

afterEach(async () => {
  await destroyTestDb(db);
});

describe("saveHomebrewEntry — creating", () => {
  it("stores the entry under a slug of its name", async () => {
    const result = await saveHomebrewEntry("subraces", { ...SUBRACE, index: "" }, undefined, db);

    expect(result.ok && result.entry.index).toBe("azure-dwarf");
  });

  it("makes the stored entry readable back", async () => {
    await saveHomebrewEntry("subraces", { ...SUBRACE, index: "" }, undefined, db);

    const stored = await getHomebrewEntry("subraces", "azure-dwarf", db);

    expect(stored?.name).toBe("Azure Dwarf");
  });

  it("stamps updatedAt, which is what the list sorts on", async () => {
    const result = await saveHomebrewEntry("subraces", { ...SUBRACE, index: "" }, undefined, db);

    expect(result.ok && result.entry.updatedAt).toBeInstanceOf(Date);
  });

  it("de-duplicates a second entry sharing a name", async () => {
    await saveHomebrewEntry("subraces", { ...SUBRACE, index: "" }, undefined, db);
    const second = await saveHomebrewEntry("subraces", { ...SUBRACE, index: "" }, undefined, db);

    expect(second.ok && second.entry.index).toBe("azure-dwarf-2");
  });

  /**
   * The apostrophe rule, end to end: an entry authored as `Healer's Kit` must
   * land on the same slug upstream uses, or the picker shows two things that
   * look identical.
   */
  it("slugs an apostrophe the way upstream does", async () => {
    const result = await saveHomebrewEntry(
      "equipment",
      {
        index: "",
        name: "Healer's Kit",
        equipment_category: { index: "adventuring-gear", name: "Adventuring Gear", url: "/api/x" },
        cost: { quantity: 5, unit: "gp" },
        url: "/api/equipment/healers-kit",
      },
      undefined,
      db,
    );

    expect(result.ok && result.entry.index).toBe("healers-kit");
  });

  it("coexists with a catalog entry of the same index", async () => {
    await db.dnd_catalog_races.put({ index: "human", name: "Human" });

    const result = await saveHomebrewEntry(
      "races",
      {
        index: "",
        name: "Human",
        speed: 30,
        ability_bonuses: [],
        alignment: "Any",
        age: "Short",
        size: "Medium",
        size_description: "Medium",
        languages: [],
        language_desc: "Common",
        url: "/api/races/human",
      },
      undefined,
      db,
    );

    expect(result.ok && result.entry.index).toBe("human");
    await expect(db.dnd_catalog_races.get("human")).resolves.toMatchObject({ name: "Human" });
  });

  it("refuses an entry that fails its schema, storing nothing", async () => {
    const result = await saveHomebrewEntry("subraces", { index: "", name: "Broken" }, undefined, db);

    expect(result.ok).toBe(false);
    await expect(db.dnd_homebrew_subraces.count()).resolves.toBe(0);
  });

  it("refuses a name with nothing sluggable in it", async () => {
    const result = await saveHomebrewEntry("subraces", { ...SUBRACE, index: "", name: "!!!" }, undefined, db);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues[0].path).toBe("name");
  });
});

describe("saveHomebrewEntry — editing", () => {
  beforeEach(async () => {
    await saveHomebrewEntry("subraces", { ...SUBRACE, index: "" }, undefined, db);
  });

  it("keeps the entry's own index rather than walking it to -2", async () => {
    const result = await saveHomebrewEntry("subraces", { ...SUBRACE, index: "azure-dwarf" }, "azure-dwarf", db);

    expect(result.ok && result.entry.index).toBe("azure-dwarf");
  });

  it("updates in place rather than adding a second row", async () => {
    await saveHomebrewEntry("subraces", { ...SUBRACE, index: "azure-dwarf", desc: "Rewritten." }, "azure-dwarf", db);

    await expect(db.dnd_homebrew_subraces.count()).resolves.toBe(1);
    await expect(getHomebrewEntry("subraces", "azure-dwarf", db)).resolves.toMatchObject({ desc: "Rewritten." });
  });

  /**
   * An edit is applied live and merely REPORTS who is affected — the referent
   * still exists, so nothing is stranded. See CONTEXT.md § Catalog reference.
   */
  it("reports which characters the edit reaches, without blocking it", async () => {
    await createCharacter(
      {
        name: "Zephyr",
        level: 1,
        classRef: "catalog:fighter",
        raceRef: "catalog:dwarf",
        subraceRef: "homebrew:azure-dwarf",
      },
      db,
    );

    const result = await saveHomebrewEntry("subraces", { ...SUBRACE, index: "azure-dwarf" }, "azure-dwarf", db);

    expect(result.ok).toBe(true);
    expect(result.ok && result.affected.map((one) => one.name)).toEqual(["Zephyr"]);
  });

  /**
   * A rename changes the id, and the id is what characters point at. Renaming
   * a referenced entry would dangle every one of them, so the index is held
   * fixed and only the display name moves.
   */
  it("keeps the id fixed when the name changes, so no ref dangles", async () => {
    const result = await saveHomebrewEntry(
      "subraces",
      { ...SUBRACE, index: "azure-dwarf", name: "Cobalt Dwarf" },
      "azure-dwarf",
      db,
    );

    expect(result.ok && result.entry.index).toBe("azure-dwarf");
    expect(result.ok && result.entry.name).toBe("Cobalt Dwarf");
  });
});

describe("deleteHomebrewEntry", () => {
  beforeEach(async () => {
    await saveHomebrewEntry("subraces", { ...SUBRACE, index: "" }, undefined, db);
  });

  it("deletes an unreferenced entry", async () => {
    const result = await deleteHomebrewEntry("subraces", "azure-dwarf", db);

    expect(result.ok).toBe(true);
    await expect(getHomebrewEntry("subraces", "azure-dwarf", db)).resolves.toBeUndefined();
  });

  it("refuses while a character references it", async () => {
    await createCharacter(
      {
        name: "Zephyr",
        level: 1,
        classRef: "catalog:fighter",
        raceRef: "catalog:dwarf",
        subraceRef: "homebrew:azure-dwarf",
      },
      db,
    );

    const result = await deleteHomebrewEntry("subraces", "azure-dwarf", db);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockedBy.map((one) => one.name)).toEqual(["Zephyr"]);
  });

  it("leaves the entry in place when it refuses", async () => {
    await createCharacter(
      {
        name: "Zephyr",
        level: 1,
        classRef: "catalog:fighter",
        raceRef: "catalog:dwarf",
        subraceRef: "homebrew:azure-dwarf",
      },
      db,
    );

    await deleteHomebrewEntry("subraces", "azure-dwarf", db);

    await expect(getHomebrewEntry("subraces", "azure-dwarf", db)).resolves.toBeDefined();
  });

  it("deletes once the last referencing character is gone", async () => {
    const zephyr = await createCharacter(
      {
        name: "Zephyr",
        level: 1,
        classRef: "catalog:fighter",
        raceRef: "catalog:dwarf",
        subraceRef: "homebrew:azure-dwarf",
      },
      db,
    );
    await db.dnd_characters.delete(zephyr.id);

    await expect(deleteHomebrewEntry("subraces", "azure-dwarf", db)).resolves.toMatchObject({ ok: true });
  });

  it("is not an error on an entry that is already gone", async () => {
    await expect(deleteHomebrewEntry("subraces", "never-existed", db)).resolves.toMatchObject({ ok: true });
  });
});

describe("listHomebrewEntries", () => {
  it("returns the type's entries, most recently edited first", async () => {
    await db.dnd_homebrew_races.bulkPut([
      { index: "older", name: "Older", updatedAt: new Date("2026-01-01") },
      { index: "newer", name: "Newer", updatedAt: new Date("2026-06-01") },
    ]);

    const entries = await listHomebrewEntries("races", db);

    expect(entries.map((one) => one.index)).toEqual(["newer", "older"]);
  });

  it("is empty rather than throwing when nothing is authored", async () => {
    await expect(listHomebrewEntries("races", db)).resolves.toEqual([]);
  });
});

describe("listHomebrewLibrary", () => {
  it("groups every authorable type, in list order, empties included", async () => {
    const groups = await listHomebrewLibrary(db);

    expect(groups.map((one) => one.type)).toEqual([
      "races",
      "subraces",
      "classes",
      "subclasses",
      "backgrounds",
      "equipment",
      "spells",
    ]);
  });

  it("carries each type's entries under its group", async () => {
    await db.dnd_homebrew_races.put({ index: "azureborn", name: "Azureborn", updatedAt: new Date() });

    const groups = await listHomebrewLibrary(db);

    expect(groups.find((one) => one.type === "races")?.entries.map((e) => e.index)).toEqual(["azureborn"]);
  });
});
