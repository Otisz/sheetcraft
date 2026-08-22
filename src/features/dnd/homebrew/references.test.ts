import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCharacter } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import type { Ref } from "@/features/dnd/db/schema";
import { charactersReferencing, parentSourceOf } from "@/features/dnd/homebrew/references";
import { createTestDb, destroyTestDb } from "@/test/db";

let db: SheetcraftDb;

beforeEach(() => {
  db = createTestDb("homebrew-references");
});

afterEach(async () => {
  await destroyTestDb(db);
});

/** A character with everything defaulted but the refs a case cares about. */
async function character(name: string, overrides: Partial<Parameters<typeof createCharacter>[0]> = {}) {
  return createCharacter({ name, level: 1, classRef: "catalog:fighter", raceRef: "catalog:human", ...overrides }, db);
}

describe("charactersReferencing", () => {
  it("finds nothing when no character points at the entry", async () => {
    await character("Bruenor");

    await expect(charactersReferencing("races", "azureborn", db)).resolves.toEqual([]);
  });

  it("finds a character by its race ref", async () => {
    await character("Zephyr", { raceRef: "homebrew:azureborn" });

    const found = await charactersReferencing("races", "azureborn", db);

    expect(found.map((one) => one.name)).toEqual(["Zephyr"]);
  });

  it.each([
    ["classes", "classRef"],
    ["subclasses", "subclassRef"],
    ["races", "raceRef"],
    ["subraces", "subraceRef"],
    ["backgrounds", "backgroundRef"],
  ] as const)("scans the %s ref field", async (type, field) => {
    await character("Zephyr", { [field]: "homebrew:brewed" as Ref });

    const found = await charactersReferencing(type, "brewed", db);

    expect(found.map((one) => one.name)).toEqual(["Zephyr"]);
  });

  it("scans equipment entries, which hold their ref inside a row", async () => {
    const zephyr = await character("Zephyr");
    await db.dnd_characters.put({
      ...zephyr,
      equipment: [{ itemRef: "homebrew:sunblade", quantity: 1, equipped: true }],
    });

    const found = await charactersReferencing("equipment", "sunblade", db);

    expect(found.map((one) => one.name)).toEqual(["Zephyr"]);
  });

  it.each(["known", "prepared"] as const)("scans %s spells", async (list) => {
    const zephyr = await character("Zephyr");
    await db.dnd_characters.put({ ...zephyr, spells: { known: [], prepared: [], [list]: ["homebrew:starfall"] } });

    const found = await charactersReferencing("spells", "starfall", db);

    expect(found.map((one) => one.name)).toEqual(["Zephyr"]);
  });

  /**
   * The prefix is what disambiguates the two namespaces. A scan that matched
   * on the index alone would refuse to delete `homebrew:human` because some
   * character is a `catalog:human`.
   */
  it("does not match a catalog ref carrying the same index", async () => {
    await character("Bruenor", { raceRef: "catalog:human" });

    await expect(charactersReferencing("races", "human", db)).resolves.toEqual([]);
  });

  /** A ref is matched whole; `azure` must not match `azureborn`. */
  it("matches the whole index, not a prefix of it", async () => {
    await character("Zephyr", { raceRef: "homebrew:azureborn" });

    await expect(charactersReferencing("races", "azure", db)).resolves.toEqual([]);
  });

  it("does not confuse one type's index for another's", async () => {
    await character("Zephyr", { raceRef: "homebrew:shared" });

    await expect(charactersReferencing("spells", "shared", db)).resolves.toEqual([]);
  });

  it("names every referencing character, so the refusal can list them", async () => {
    await character("Zephyr", { raceRef: "homebrew:azureborn" });
    await character("Alys", { raceRef: "homebrew:azureborn" });
    await character("Bruenor", { raceRef: "catalog:dwarf" });

    const found = await charactersReferencing("races", "azureborn", db);

    expect(found.map((one) => one.name).sort()).toEqual(["Alys", "Zephyr"]);
  });

  it("counts a character once even when it references the entry twice", async () => {
    const zephyr = await character("Zephyr");
    await db.dnd_characters.put({
      ...zephyr,
      spells: { known: ["homebrew:starfall"], prepared: ["homebrew:starfall"] },
    });

    await expect(charactersReferencing("spells", "starfall", db)).resolves.toHaveLength(1);
  });
});

describe("parentSourceOf", () => {
  it("says homebrew when the parent is a homebrew entry", async () => {
    await db.dnd_homebrew_races.put({ index: "azureborn", name: "Azureborn", updatedAt: new Date() });

    await expect(parentSourceOf("races", "azureborn", db)).resolves.toBe("homebrew");
  });

  it("says catalog when the parent is an SRD entry", async () => {
    await db.dnd_catalog_races.put({ index: "dwarf", name: "Dwarf" });

    await expect(parentSourceOf("races", "dwarf", db)).resolves.toBe("catalog");
  });

  /**
   * Both tables can hold the index — `catalog:human` and `homebrew:human`
   * coexist. Homebrew wins, because a homebrew subrace of a homebrew race is
   * the case the author is most likely to have meant, and the picker shows the
   * choice either way.
   */
  it("prefers homebrew when both tables hold the index", async () => {
    await db.dnd_catalog_races.put({ index: "human", name: "Human" });
    await db.dnd_homebrew_races.put({ index: "human", name: "Human", updatedAt: new Date() });

    await expect(parentSourceOf("races", "human", db)).resolves.toBe("homebrew");
  });

  /** A parent in neither table falls back to catalog, which is where most live. */
  it("falls back to catalog for an index in neither table", async () => {
    await expect(parentSourceOf("races", "gone", db)).resolves.toBe("catalog");
  });

  it("falls back to catalog for a blank index", async () => {
    await expect(parentSourceOf("races", "", db)).resolves.toBe("catalog");
  });
});
