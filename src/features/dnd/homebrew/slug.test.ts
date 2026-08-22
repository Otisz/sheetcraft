import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { slugify, uniqueSlug } from "@/features/dnd/homebrew/slug";
import { createTestDb, destroyTestDb } from "@/test/db";

describe("slugify", () => {
  it("lowercases and joins words with a single separator", () => {
    expect(slugify("Azureborn Wanderer")).toBe("azureborn-wanderer");
  });

  /**
   * The rule the whole ticket names: apostrophes are stripped BEFORE the
   * separator pass, or `Healer's Kit` lands on `healer-s-kit` while upstream
   * has `healers-kit`, and the two sit in the same picker looking like a
   * duplicate of each other.
   */
  it.each([
    ["Healer's Kit", "healers-kit"],
    ["Thieves' Tools", "thieves-tools"],
    ["Mage’s Hand", "mages-hand"],
    ["`Odd` Quote", "odd-quote"],
  ])("strips apostrophes before separators: %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("collapses runs of separators and trims them from both ends", () => {
    expect(slugify("  --Fire  Bolt!! ")).toBe("fire-bolt");
  });

  it("keeps digits, which appear in real entry names", () => {
    expect(slugify("Potion of Healing 2")).toBe("potion-of-healing-2");
  });

  it("folds accents rather than dropping the letters", () => {
    expect(slugify("Élan Vitäl")).toBe("elan-vital");
  });

  it("returns an empty string when nothing survives, so a caller can refuse it", () => {
    expect(slugify("!!!")).toBe("");
  });
});

let db: SheetcraftDb;

beforeEach(() => {
  db = createTestDb("homebrew-slug");
});

afterEach(async () => {
  await destroyTestDb(db);
});

describe("uniqueSlug", () => {
  it("returns the plain slug when nothing in the type holds it", async () => {
    await expect(uniqueSlug("races", "Azureborn", db)).resolves.toBe("azureborn");
  });

  it("suffixes a counter when the slug is taken within the type", async () => {
    await db.dnd_homebrew_races.put({ index: "azureborn", name: "Azureborn", updatedAt: new Date() });

    await expect(uniqueSlug("races", "Azureborn", db)).resolves.toBe("azureborn-2");
  });

  it("keeps counting past the first collision", async () => {
    await db.dnd_homebrew_races.bulkPut([
      { index: "azureborn", name: "Azureborn", updatedAt: new Date() },
      { index: "azureborn-2", name: "Azureborn", updatedAt: new Date() },
    ]);

    await expect(uniqueSlug("races", "Azureborn", db)).resolves.toBe("azureborn-3");
  });

  /**
   * De-duplication is scoped to the type, not global: a race and a spell may
   * both be called Azureborn, and they address different tables.
   */
  it("de-duplicates within a type only", async () => {
    await db.dnd_homebrew_spells.put({ index: "azureborn", name: "Azureborn", updatedAt: new Date() });

    await expect(uniqueSlug("races", "Azureborn", db)).resolves.toBe("azureborn");
  });

  /**
   * The catalog is a different namespace — `catalog:human` and
   * `homebrew:human` coexist, disambiguated by the prefix.
   */
  it("ignores the catalog table, so catalog:human and homebrew:human coexist", async () => {
    await db.dnd_catalog_races.put({ index: "human", name: "Human" });

    await expect(uniqueSlug("races", "Human", db)).resolves.toBe("human");
  });

  it("keeps the entry's own slug when it is the one holding it", async () => {
    await db.dnd_homebrew_races.put({ index: "azureborn", name: "Azureborn", updatedAt: new Date() });

    await expect(uniqueSlug("races", "Azureborn", db, "azureborn")).resolves.toBe("azureborn");
  });

  it("returns null for a name with nothing sluggable in it", async () => {
    await expect(uniqueSlug("races", "!!!", db)).resolves.toBeNull();
  });
});
