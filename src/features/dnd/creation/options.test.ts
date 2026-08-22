import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadClassOptions,
  loadRaceOptions,
  loadSubclassOptions,
  loadSubraceOptions,
} from "@/features/dnd/creation/options";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { createTestDb, destroyTestDb } from "@/test/db";

let db: SheetcraftDb;

beforeEach(async () => {
  db = createTestDb("creation-options");
});

afterEach(async () => {
  await destroyTestDb(db);
});

describe("loadClassOptions", () => {
  beforeEach(async () => {
    await db.dnd_catalog_classes.bulkPut([
      { index: "wizard", name: "Wizard" },
      { index: "fighter", name: "Fighter" },
    ]);
    await db.dnd_homebrew_classes.bulkPut([{ index: "artificer", name: "Artificer", updatedAt: new Date() }]);
  });

  it("puts every SRD entry before every homebrew one", async () => {
    const options = await loadClassOptions(db);

    expect(options.map((one) => one.source)).toEqual(["catalog", "catalog", "homebrew"]);
  });

  it("sorts within each group by name, so the picker is scannable", async () => {
    const options = await loadClassOptions(db);

    expect(options.map((one) => one.name)).toEqual(["Fighter", "Wizard", "Artificer"]);
  });

  it("tags each option with the ref the draft stores", async () => {
    const options = await loadClassOptions(db);

    expect(options.map((one) => one.ref)).toEqual(["catalog:fighter", "catalog:wizard", "homebrew:artificer"]);
  });

  it("returns an empty list rather than throwing when nothing is installed", async () => {
    await db.dnd_catalog_classes.clear();
    await db.dnd_homebrew_classes.clear();

    await expect(loadClassOptions(db)).resolves.toEqual([]);
  });
});

describe("loadSubclassOptions", () => {
  beforeEach(async () => {
    await db.dnd_catalog_subclasses.bulkPut([
      { index: "champion", name: "Champion", class: { index: "fighter" } },
      { index: "evocation", name: "Evocation", class: { index: "wizard" } },
    ]);
    await db.dnd_homebrew_subclasses.bulkPut([
      { index: "cavalier", name: "Cavalier", class: { index: "fighter" }, updatedAt: new Date() },
    ]);
  });

  it("offers only the chosen class's subclasses, SRD first", async () => {
    const options = await loadSubclassOptions("catalog:fighter", db);

    expect(options.map((one) => one.ref)).toEqual(["catalog:champion", "homebrew:cavalier"]);
  });

  it("offers nothing when no class is chosen", async () => {
    await expect(loadSubclassOptions(null, db)).resolves.toEqual([]);
  });

  it("matches a homebrew subclass to a homebrew parent class by its bare index", async () => {
    await db.dnd_homebrew_subclasses.bulkPut([
      { index: "alchemist", name: "Alchemist", class: { index: "artificer" }, updatedAt: new Date() },
    ]);

    const options = await loadSubclassOptions("homebrew:artificer", db);
    expect(options.map((one) => one.ref)).toEqual(["homebrew:alchemist"]);
  });
});

describe("loadSubraceOptions", () => {
  beforeEach(async () => {
    await db.dnd_catalog_subraces.bulkPut([
      { index: "hill-dwarf", name: "Hill Dwarf", race: { index: "dwarf" } },
      { index: "high-elf", name: "High Elf", race: { index: "elf" } },
    ]);
  });

  it("offers only the chosen race's subraces", async () => {
    await expect(loadSubraceOptions("catalog:dwarf", db)).resolves.toMatchObject([{ ref: "catalog:hill-dwarf" }]);
  });

  it("offers nothing for a race that has no subraces — the field stays hidden", async () => {
    await expect(loadSubraceOptions("catalog:human", db)).resolves.toEqual([]);
  });
});

describe("loadRaceOptions", () => {
  it("carries the whole entry, so the caller can read ability bonuses without a second lookup", async () => {
    await db.dnd_catalog_races.bulkPut([
      { index: "dwarf", name: "Dwarf", ability_bonuses: [{ ability_score: { index: "con" }, bonus: 2 }] },
    ]);

    const [dwarf] = await loadRaceOptions(db);
    expect(dwarf.entry.ability_bonuses).toEqual([{ ability_score: { index: "con" }, bonus: 2 }]);
  });
});
