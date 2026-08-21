import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_V1, type SheetcraftDb } from "@/features/dnd/db/db";
import { createTestDb, destroyTestDb } from "@/test/db";

let db: SheetcraftDb | undefined;

function open(prefix: string): SheetcraftDb {
  db = createTestDb(prefix);
  return db;
}

afterEach(async () => {
  await destroyTestDb(db);
  db = undefined;
});

describe("version 1 schema", () => {
  it("declares all 23 tables", async () => {
    const database = open("schema-tables");
    await database.open();

    const names = database.tables.map((table) => table.name).sort();
    expect(names).toHaveLength(23);
    expect(names).toEqual(Object.keys(SCHEMA_V1).sort());
  });

  it("declares one table per catalog type, a homebrew mirror for the 7 authorable ones, plus characters and meta", () => {
    const names = Object.keys(SCHEMA_V1);
    const catalog = names.filter((name) => name.startsWith("dnd_catalog_"));
    const homebrew = names.filter((name) => name.startsWith("dnd_homebrew_"));

    expect(catalog).toEqual([
      "dnd_catalog_classes",
      "dnd_catalog_subclasses",
      "dnd_catalog_races",
      "dnd_catalog_subraces",
      "dnd_catalog_backgrounds",
      "dnd_catalog_levels",
      "dnd_catalog_features",
      "dnd_catalog_traits",
      "dnd_catalog_equipment",
      "dnd_catalog_equipment_categories",
      "dnd_catalog_proficiencies",
      "dnd_catalog_skills",
      "dnd_catalog_ability_scores",
      "dnd_catalog_spells",
    ]);
    expect(homebrew).toEqual([
      "dnd_homebrew_classes",
      "dnd_homebrew_subclasses",
      "dnd_homebrew_races",
      "dnd_homebrew_subraces",
      "dnd_homebrew_backgrounds",
      "dnd_homebrew_equipment",
      "dnd_homebrew_spells",
    ]);
    expect(names).toContain("dnd_characters");
    expect(names).toContain("dnd_meta");

    // Every homebrew table mirrors an existing catalog table.
    for (const name of homebrew) {
      expect(catalog).toContain(name.replace("dnd_homebrew_", "dnd_catalog_"));
    }
  });

  it("uses the agreed primary keys", async () => {
    const database = open("schema-keys");
    await database.open();

    expect(database.dnd_characters.schema.primKey.keyPath).toBe("id");
    expect(database.dnd_meta.schema.primKey.keyPath).toBe("key");
    expect(database.dnd_catalog_spells.schema.primKey.keyPath).toBe("index");
    expect(database.dnd_homebrew_races.schema.primKey.keyPath).toBe("index");
  });

  it("indexes only what is queried", async () => {
    const database = open("schema-indexes");
    await database.open();

    const indexesOf = (table: string) =>
      database
        .table(table)
        .schema.indexes.map((index) => index.name)
        .sort();

    expect(indexesOf("dnd_characters")).toEqual(["name", "updatedAt"]);
    expect(indexesOf("dnd_catalog_spells")).toEqual(["classes", "level"]);
    expect(indexesOf("dnd_catalog_levels")).toEqual(["[class+level]"]);
    expect(indexesOf("dnd_catalog_classes")).toEqual([]);
    expect(indexesOf("dnd_homebrew_spells")).toEqual(["classes", "level", "updatedAt"]);
  });

  it("indexes no boolean anywhere", () => {
    // Only string/number/Date/Array are indexable in Dexie. The booleans this
    // schema stores — `equipped`, `inspiration`, `enabled` — must never appear.
    const booleanFields = ["equipped", "inspiration", "enabled", "required", "isHomebrew", "prepared"];

    for (const declaration of Object.values(SCHEMA_V1)) {
      const keys = declaration.split(",").map((key) => key.trim().replace(/^[*&]/, ""));
      for (const field of booleanFields) {
        expect(keys).not.toContain(field);
      }
    }
  });

  it("never indexes the payload", async () => {
    const database = open("schema-payload");
    await database.open();

    // Catalog tables index `index` plus only the scalar a picker filters on;
    // the full entry stays an unindexed property.
    for (const table of database.tables) {
      for (const index of table.schema.indexes) {
        expect(index.keyPath).toBeDefined();
      }
    }
    expect(database.dnd_catalog_equipment.schema.indexes.map((index) => index.name)).toEqual(["equipment_category"]);
  });
});

describe("open behaviour", () => {
  it("does not open during construction", () => {
    const database = open("schema-lazy");
    expect(database.isOpen()).toBe(false);
  });

  it("opens on the first query, without an explicit open()", async () => {
    const database = open("schema-autoopen");
    await expect(database.dnd_characters.count()).resolves.toBe(0);
    expect(database.isOpen()).toBe(true);
  });
});

describe("the singleton", () => {
  it("is memoised and lazily constructed, and importing it opens nothing", async () => {
    // Importing this module is what a server-rendered route does; only a query
    // may touch IndexedDB.
    const { getDb, resetDb } = await import("@/features/dnd/db/db");

    const first = getDb();
    expect(first.isOpen()).toBe(false);
    expect(getDb()).toBe(first);

    await first.dnd_characters.count();
    expect(first.isOpen()).toBe(true);

    resetDb();
    expect(getDb()).not.toBe(first);

    resetDb();
    await first.delete();
  });
});
