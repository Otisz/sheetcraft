import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { subclassLevel } from "@/features/dnd/creation/subclass-timing";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { createTestDb, destroyTestDb } from "@/test/db";

/**
 * Subclass timing is DERIVED, never hardcoded: the threshold is the first
 * level whose `Levels` row carries a `subclass` field. Expected values are
 * transcribed from the PHB, not computed by the code under test — cleric,
 * sorcerer and warlock choose at 1, druid and wizard at 2, the other seven at
 * 3. See ADR-0002 § Fixtures.
 */

let db: SheetcraftDb;

/** One `Levels` row, trimmed to the two fields the derivation reads. */
function levelRow(className: string, level: number, hasSubclass: boolean) {
  return {
    index: `${className}-${level}`,
    level,
    class: { index: className, name: className, url: "" },
    ...(hasSubclass ? { subclass: { index: `${className}-sub`, name: "Sub", url: "" } } : {}),
  };
}

/** Rows for one class, marking `subclass` from `threshold` upward. */
function classRows(className: string, threshold: number) {
  return Array.from({ length: 20 }, (_, i) => levelRow(className, i + 1, i + 1 >= threshold));
}

beforeEach(async () => {
  db = createTestDb("subclass-timing");
  await db.dnd_catalog_levels.bulkPut([
    ...classRows("cleric", 1),
    ...classRows("wizard", 2),
    ...classRows("fighter", 3),
  ]);
});

afterEach(async () => {
  await destroyTestDb(db);
});

describe("subclassLevel", () => {
  it.each([
    ["cleric", 1],
    ["wizard", 2],
    ["fighter", 3],
  ])("derives %s's subclass level as %i", async (className, expected) => {
    expect(await subclassLevel(`catalog:${className}`, db)).toBe(expected);
  });

  it("returns null for a class with no subclass rows at all", async () => {
    await db.dnd_catalog_levels.bulkPut(classRows("commoner", 21));
    expect(await subclassLevel("catalog:commoner", db)).toBeNull();
  });

  it("returns null for a class that has no levels rows — a homebrew class gets no false threshold", async () => {
    expect(await subclassLevel("homebrew:azureborn", db)).toBeNull();
  });

  it("takes the FIRST subclass row, not the last, when rows arrive out of order", async () => {
    await db.dnd_catalog_levels.bulkPut([
      levelRow("bard", 10, true),
      levelRow("bard", 3, true),
      levelRow("bard", 1, false),
    ]);
    expect(await subclassLevel("catalog:bard", db)).toBe(3);
  });
});
