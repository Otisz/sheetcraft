/**
 * The acceptance path of [#170](https://github.com/Otisz/sheetcraft/issues/170),
 * end to end: a newly created barbarian carries a togglable Unarmored Defense
 * record, and flipping it moves the AC the play screen shows.
 *
 * Runs against `fake-indexeddb` with the database constructed exactly as
 * production constructs it, and goes through the same repository the UI does.
 * See ADR-0002.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCharacter, updateCharacter } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import type { CharacterRecord } from "@/features/dnd/db/schema";
import { derive, EMPTY_CONTEXT } from "@/features/dnd/derive";
import { activeEffects, effectGroups, toggleEffect } from "@/features/dnd/play/effects";
import { createTestDb, destroyTestDb } from "@/test/db";

let db: SheetcraftDb;

const BARBARIAN_UNARMORED = {
  index: "barbarian-unarmored-defense",
  name: "Unarmored Defense",
  level: 1,
  class: { index: "barbarian" },
  desc: [
    "While you are not wearing any armor, your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier.",
  ],
};

const MONK_UNARMORED = {
  index: "monk-unarmored-defense",
  name: "Unarmored Defense",
  level: 1,
  class: { index: "monk" },
  desc: [
    "Beginning at 1st level, while you are wearing no armor and not wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.",
  ],
};

/** Prose only — the SRD says nothing structured, so it contributes no record. */
const RAGE = {
  index: "rage",
  name: "Rage",
  level: 1,
  class: { index: "barbarian" },
  desc: ["In battle, you fight with primal ferocity."],
};

const FRENZY = {
  index: "frenzy",
  name: "Frenzy",
  level: 3,
  class: { index: "barbarian" },
  subclass: { index: "berserker" },
  desc: ["You can go into a frenzy when you rage."],
};

const HIGH_CON = { str: 16, dex: 14, con: 16, int: 8, wis: 12, cha: 10 };

beforeEach(async () => {
  db = createTestDb("feature-seeding");
  await db.dnd_catalog_features.bulkPut([BARBARIAN_UNARMORED, MONK_UNARMORED, RAGE, FRENZY]);
});

afterEach(async () => {
  await destroyTestDb(db);
});

function newBarbarian(over: Partial<Parameters<typeof createCharacter>[0]> = {}) {
  return createCharacter(
    {
      name: "Korgan",
      level: 1,
      classRef: "catalog:barbarian",
      raceRef: "catalog:human",
      abilities: HIGH_CON,
      hpRolls: [12],
      ...over,
    },
    db,
  );
}

describe("a newly created barbarian", () => {
  it("carries an Unarmored Defense record", async () => {
    const created = await newBarbarian();

    expect(created.modifiers).toContainEqual({
      id: "feature:barbarian-unarmored-defense:ac",
      source: "feature:barbarian-unarmored-defense",
      target: "ac",
      op: "add",
      value: { ref: "mod.con" },
      enabled: false,
      label: "Unarmored Defense",
    });
  });

  it("offers it in the effects drawer — the toggle finally has something to toggle", async () => {
    const created = await newBarbarian();

    expect(effectGroups(created).effects.map((effect) => effect.label)).toContain("Unarmored Defense");
  });

  it("shows nothing on the row until the player switches it on", async () => {
    const created = await newBarbarian();

    expect(activeEffects(created)).toEqual([]);
  });

  it("carries no record for Rage — it changes no number this app derives", async () => {
    const created = await newBarbarian();

    expect(created.modifiers.map((modifier) => modifier.source)).not.toContain("feature:rage");
  });

  it("carries no record for a subclass it did not take", async () => {
    const created = await newBarbarian({ level: 3 });

    expect(created.modifiers.map((modifier) => modifier.source)).not.toContain("feature:frenzy");
  });
});

describe("toggling it", () => {
  async function toggleUnarmoredDefense(character: CharacterRecord): Promise<CharacterRecord> {
    const modifiers = toggleEffect(character.modifiers, "feature:barbarian-unarmored-defense:ac");
    const updated = await updateCharacter(character.id, { modifiers }, db);
    if (!updated) {
      throw new Error("the character vanished mid-test");
    }
    return updated;
  }

  it("visibly changes AC", async () => {
    const created = await newBarbarian();
    const before = derive(created, EMPTY_CONTEXT).armorClass;

    const toggled = await toggleUnarmoredDefense(created);
    const after = derive(toggled, EMPTY_CONTEXT).armorClass;

    // Base is 10 + DEX 2 with no armor equipped; CON 16 adds a further 3.
    expect(before).toBe(12);
    expect(after).toBe(15);
  });

  it("puts it on the effects row once it is on", async () => {
    const toggled = await toggleUnarmoredDefense(await newBarbarian());

    expect(activeEffects(toggled).map((effect) => effect.label)).toEqual(["Unarmored Defense"]);
  });

  it("names its step in the trace, so the sheet can answer why AC is 15", async () => {
    const toggled = await toggleUnarmoredDefense(await newBarbarian());
    const trace = derive(toggled, EMPTY_CONTEXT).explain("ac");

    expect(trace.steps.map((step) => step.source)).toContain("feature:barbarian-unarmored-defense");
  });
});

describe("the monk variant", () => {
  it("derives from WIS, not CON — one map, two correct formulas", async () => {
    const monk = await createCharacter(
      {
        name: "Tenzin",
        level: 1,
        classRef: "catalog:monk",
        raceRef: "catalog:human",
        // WIS and CON deliberately differ, so a wrong ability is a wrong number.
        abilities: { str: 10, dex: 14, con: 16, int: 10, wis: 18, cha: 8 },
        hpRolls: [8],
      },
      db,
    );

    expect(monk.modifiers).toContainEqual(
      expect.objectContaining({ source: "feature:monk-unarmored-defense", value: { ref: "mod.wis" } }),
    );

    const toggled = { ...monk, modifiers: toggleEffect(monk.modifiers, "feature:monk-unarmored-defense:ac") };
    // 10 + DEX 2 + WIS 4 — a CON reading would have given 15.
    expect(derive(toggled, EMPTY_CONTEXT).armorClass).toBe(16);
  });
});

describe("records the character already carries", () => {
  it("keeps a homebrew record the player authored — nothing is special-cased for SRD", async () => {
    const created = await newBarbarian({
      modifiers: [
        {
          id: "homebrew:azure-ward:ac",
          source: "homebrew:azure-ward",
          target: "ac",
          op: "add",
          value: 2,
          enabled: true,
          label: "Azure Ward",
        },
      ],
    });

    expect(created.modifiers.map((modifier) => modifier.source)).toContain("homebrew:azure-ward");
    expect(created.modifiers.map((modifier) => modifier.source)).toContain("feature:barbarian-unarmored-defense");
  });

  it("keeps racial bonuses, which are character data rather than a toggle", async () => {
    const created = await newBarbarian({
      modifiers: [
        {
          id: "race:catalog:dwarf:ability.con",
          source: "race:catalog:dwarf",
          target: "ability.con",
          op: "add",
          value: 2,
          enabled: true,
          label: "Dwarf +2 CON",
        },
      ],
    });

    expect(created.modifiers).toContainEqual(expect.objectContaining({ source: "race:catalog:dwarf", enabled: true }));
  });
});

describe("a class with no numeric features", () => {
  it("creates cleanly, carrying no feature records at all", async () => {
    const wizard = await createCharacter(
      { name: "Ellyn", level: 1, classRef: "catalog:wizard", raceRef: "catalog:human", hpRolls: [6] },
      db,
    );

    expect(wizard.modifiers).toEqual([]);
  });
});
