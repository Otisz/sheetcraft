/**
 * The one class-feature scan, shared by the Features tab and the modifier map.
 *
 * Runs against `fake-indexeddb` with the database constructed exactly as
 * production constructs it. See ADR-0002.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadClassFeatures } from "@/features/dnd/db/class-features";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { createTestDb, destroyTestDb } from "@/test/db";

let db: SheetcraftDb;

const RAGE = { index: "rage", name: "Rage", level: 1, class: { index: "barbarian" } };
const RECKLESS = { index: "reckless-attack", name: "Reckless Attack", level: 2, class: { index: "barbarian" } };
const BRUTAL = { index: "brutal-critical", name: "Brutal Critical", level: 9, class: { index: "barbarian" } };
const FRENZY = {
  index: "frenzy",
  name: "Frenzy",
  level: 3,
  class: { index: "barbarian" },
  subclass: { index: "berserker" },
};
const TOTEM = {
  index: "totem-spirit",
  name: "Totem Spirit",
  level: 3,
  class: { index: "barbarian" },
  subclass: { index: "totem-warrior" },
};
const SNEAK_ATTACK = { index: "sneak-attack", name: "Sneak Attack", level: 1, class: { index: "rogue" } };

beforeEach(async () => {
  db = createTestDb("class-features");
  await db.dnd_catalog_features.bulkPut([RAGE, RECKLESS, BRUTAL, FRENZY, TOTEM, SNEAK_ATTACK]);
});

afterEach(async () => {
  await destroyTestDb(db);
});

function indexes(features: { index: string }[]): string[] {
  return features.map((feature) => feature.index);
}

describe("loadClassFeatures", () => {
  it("scopes by class — a rogue's Sneak Attack never reaches a barbarian", async () => {
    const features = await loadClassFeatures({ classRef: "catalog:barbarian", subclassRef: null, level: 20 }, db);

    expect(indexes(features)).not.toContain("sneak-attack");
  });

  it("scopes by level — a level 3 character is not shown level 9 prose", async () => {
    const features = await loadClassFeatures({ classRef: "catalog:barbarian", subclassRef: null, level: 3 }, db);

    expect(indexes(features)).not.toContain("brutal-critical");
    expect(indexes(features)).toContain("reckless-attack");
  });

  it("scopes by subclass — a Berserker sees Frenzy and a Totem Warrior does not", async () => {
    const berserker = await loadClassFeatures(
      { classRef: "catalog:barbarian", subclassRef: "catalog:berserker", level: 3 },
      db,
    );

    expect(indexes(berserker)).toContain("frenzy");
    expect(indexes(berserker)).not.toContain("totem-spirit");
  });

  it("keeps base-class features, which carry no subclass at all", async () => {
    const features = await loadClassFeatures(
      { classRef: "catalog:barbarian", subclassRef: "catalog:berserker", level: 3 },
      db,
    );

    expect(indexes(features)).toContain("rage");
  });

  it("drops every subclass feature when no subclass has been chosen", async () => {
    const features = await loadClassFeatures({ classRef: "catalog:barbarian", subclassRef: null, level: 3 }, db);

    expect(indexes(features)).toEqual(["rage", "reckless-attack"]);
  });

  it("returns them in level order", async () => {
    const features = await loadClassFeatures({ classRef: "catalog:barbarian", subclassRef: null, level: 20 }, db);

    expect(indexes(features)).toEqual(["rage", "reckless-attack", "brutal-critical"]);
  });

  it("degrades to nothing on a dangling class ref, rather than throwing", async () => {
    await expect(
      loadClassFeatures({ classRef: "catalog:not-a-class", subclassRef: null, level: 5 }, db),
    ).resolves.toEqual([]);
  });

  it("degrades to nothing on a malformed ref", async () => {
    await expect(loadClassFeatures({ classRef: null, subclassRef: null, level: 5 }, db)).resolves.toEqual([]);
  });
});
