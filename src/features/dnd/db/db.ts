import Dexie, { type EntityTable } from "dexie";
import type { CatalogEntry, CharacterRecord, HomebrewEntry, MetaRecord } from "@/features/dnd/db/schema";

/**
 * The 23 tables: one per catalog type (14), a homebrew mirror for the 7
 * authorable types, plus characters and sync metadata.
 *
 * Separate tables rather than one polymorphic table so that a catalog re-seed
 * — which is `clear()` + `bulkPut()` on the affected catalog tables — is
 * *structurally incapable* of touching user-authored homebrew. In a shared
 * table that safety would rest on every delete scoping its `where` clause
 * correctly, and a caught `BulkError` still persists its successful rows.
 *
 * Two Dexie constraints hold throughout: only string/number/Date/Array are
 * indexable, so **no boolean is ever indexed** (`equipped`, `inspiration`,
 * `enabled` are stored and never listed); and the payload itself is never
 * indexed — only the scalar fields a picker filters on.
 */
export type SheetcraftDb = Dexie & {
  // characters
  dnd_characters: EntityTable<CharacterRecord, "id">;

  // catalog — re-seeded from vendored JSON
  dnd_catalog_classes: EntityTable<CatalogEntry, "index">;
  dnd_catalog_subclasses: EntityTable<CatalogEntry, "index">;
  dnd_catalog_races: EntityTable<CatalogEntry, "index">;
  dnd_catalog_subraces: EntityTable<CatalogEntry, "index">;
  dnd_catalog_backgrounds: EntityTable<CatalogEntry, "index">;
  dnd_catalog_levels: EntityTable<CatalogEntry, "index">;
  dnd_catalog_features: EntityTable<CatalogEntry, "index">;
  dnd_catalog_traits: EntityTable<CatalogEntry, "index">;
  dnd_catalog_equipment: EntityTable<CatalogEntry, "index">;
  dnd_catalog_equipment_categories: EntityTable<CatalogEntry, "index">;
  dnd_catalog_proficiencies: EntityTable<CatalogEntry, "index">;
  dnd_catalog_skills: EntityTable<CatalogEntry, "index">;
  dnd_catalog_ability_scores: EntityTable<CatalogEntry, "index">;
  dnd_catalog_spells: EntityTable<CatalogEntry, "index">;

  // homebrew — same schema as its catalog counterpart
  dnd_homebrew_classes: EntityTable<HomebrewEntry, "index">;
  dnd_homebrew_subclasses: EntityTable<HomebrewEntry, "index">;
  dnd_homebrew_races: EntityTable<HomebrewEntry, "index">;
  dnd_homebrew_subraces: EntityTable<HomebrewEntry, "index">;
  dnd_homebrew_backgrounds: EntityTable<HomebrewEntry, "index">;
  dnd_homebrew_equipment: EntityTable<HomebrewEntry, "index">;
  dnd_homebrew_spells: EntityTable<HomebrewEntry, "index">;

  // sync metadata
  dnd_meta: EntityTable<MetaRecord, "key">;
};

export const DB_NAME = "sheetcraft";

/** The version 1 schema. Exported so tests can assert the declared keys. */
export const SCHEMA_V1 = {
  dnd_characters: "id, name, updatedAt",

  dnd_catalog_classes: "index",
  dnd_catalog_subclasses: "index, class",
  dnd_catalog_races: "index",
  dnd_catalog_subraces: "index, race",
  dnd_catalog_backgrounds: "index",
  dnd_catalog_levels: "index, [class+level]",
  dnd_catalog_features: "index, [class+level]",
  dnd_catalog_traits: "index",
  dnd_catalog_equipment: "index, equipment_category",
  dnd_catalog_equipment_categories: "index",
  dnd_catalog_proficiencies: "index",
  dnd_catalog_skills: "index, ability_score",
  dnd_catalog_ability_scores: "index",
  dnd_catalog_spells: "index, level, *classes",

  dnd_homebrew_classes: "index, updatedAt",
  dnd_homebrew_subclasses: "index, class, updatedAt",
  dnd_homebrew_races: "index, updatedAt",
  dnd_homebrew_subraces: "index, race, updatedAt",
  dnd_homebrew_backgrounds: "index, updatedAt",
  dnd_homebrew_equipment: "index, updatedAt",
  dnd_homebrew_spells: "index, level, *classes, updatedAt",

  dnd_meta: "key",
} as const;

/** The closed set of table names, so a lookup cannot address one that doesn't exist. */
export type TableName = keyof typeof SCHEMA_V1;

/**
 * Constructs the database. Constructing is safe anywhere — Dexie's constructor
 * resolves its DOM dependencies in a try/catch and never touches
 * `indexedDB` — but `open()` is not, so this is never called at module scope.
 * Use `getDb()`, which defers construction to the first query.
 */
export function createDb(name: string = DB_NAME): SheetcraftDb {
  const db = new Dexie(name) as SheetcraftDb;
  db.version(1).stores(SCHEMA_V1);
  return db;
}

let db: SheetcraftDb | undefined;

/**
 * The lazily-constructed singleton. Nothing opens the database during module
 * evaluation; the first query does, via Dexie's `autoOpen`. That matters
 * because `/dnd` routes are `ssr: false` for *rendering* only — their modules
 * still evaluate on the server, where IndexedDB does not exist.
 */
export function getDb(): SheetcraftDb {
  if (!db) {
    db = createDb();
  }
  return db;
}

/** Drops the memoised singleton, so the next `getDb()` constructs a fresh one. */
export function resetDb(): void {
  db?.close();
  db = undefined;
}
