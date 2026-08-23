import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCharacter,
  getCharacter,
  updateCharacter,
  updateCharacterRefs,
} from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import type { CharacterRecord, Ref } from "@/features/dnd/db/schema";
import { derive } from "@/features/dnd/derive";
import { entryModifierSource } from "@/features/dnd/homebrew/entry-modifiers";
import { deleteHomebrewEntry, saveHomebrewEntry } from "@/features/dnd/homebrew/repository";
import { addItem, addSpell, removeItem, toggleEquipped } from "@/features/dnd/play/loadout";
import { loadDeriveContext } from "@/features/dnd/play/sheet-context";
import { createTestDb, destroyTestDb } from "@/test/db";

/**
 * `updateCharacterRefs` — the re-sync a loadout change owes.
 *
 * Split from `characters-repository.test.ts` rather than added to it because
 * that suite covers create/read/update/delete with no catalog underneath it,
 * while every case here needs homebrew entries seeded first. One `beforeEach`
 * per concern beats one that half the file ignores.
 *
 * ADR-0006 recorded `syncAllEntryModifiers` as running in `createCharacter`
 * and nowhere else, because nothing in the app changed a character's refs
 * after creation — and named the trap that lands the moment something does: a
 * homebrew item acquired after creation contributing no records until its
 * entry is next saved. `updateCharacterRefs` is the seam that closes it, and
 * this is what holds it closed. See ADR-0007.
 */

const FIGHTER = {
  name: "Bruenor",
  level: 4,
  classRef: "catalog:fighter" as Ref,
  raceRef: "catalog:dwarf" as Ref,
};

/** A homebrew shield that authors what it does, rather than only describing it. */
const AEGIS = {
  name: "Aegis",
  equipment_category: { index: "armor", name: "Armor", url: "/api/equipment-categories/armor" },
  armor_category: "Shield",
  armor_class: { base: 2, dex_bonus: false },
  cost: { quantity: 10, unit: "gp" },
  url: "/api/equipment/aegis",
  modifiers: [{ target: "ac", op: "add", value: 1, label: "Aegis ward" }],
};

const AEGIS_REF = "homebrew:aegis" as Ref;
const AEGIS_SOURCE = entryModifierSource("equipment", "aegis");

let db: SheetcraftDb;

beforeEach(async () => {
  db = createTestDb("loadout-repository");
  const saved = await saveHomebrewEntry("equipment", AEGIS, undefined, db);
  expect(saved.ok).toBe(true);
});

afterEach(async () => {
  await destroyTestDb(db);
});

describe("acquiring a homebrew item", () => {
  it("applies the entry's records on acquisition, not on the entry's next save", async () => {
    const created = await createCharacter(FIGHTER, db);
    expect(created.modifiers.filter((one) => one.source === AEGIS_SOURCE)).toEqual([]);

    const updated = await updateCharacterRefs(created.id, { equipment: addItem([], AEGIS_REF) }, db);

    expect(updated?.modifiers.filter((one) => one.source === AEGIS_SOURCE)).toMatchObject([
      { target: "ac", op: "add", value: 1, enabled: true },
    ]);
  });

  it("stores what it returned", async () => {
    const created = await createCharacter(FIGHTER, db);
    const updated = await updateCharacterRefs(created.id, { equipment: addItem([], AEGIS_REF) }, db);

    await expect(getCharacter(created.id, db)).resolves.toEqual(updated);
  });
});

describe("dropping a homebrew item", () => {
  it("takes the entry's records with it", async () => {
    const created = await createCharacter(FIGHTER, db);
    const carrying = await updateCharacterRefs(created.id, { equipment: addItem([], AEGIS_REF) }, db);
    expect(carrying?.modifiers.some((one) => one.source === AEGIS_SOURCE)).toBe(true);

    const dropped = await updateCharacterRefs(
      created.id,
      { equipment: removeItem(carrying?.equipment ?? [], AEGIS_REF) },
      db,
    );

    expect(dropped?.modifiers.filter((one) => one.source === AEGIS_SOURCE)).toEqual([]);
  });
});

describe("the delete block", () => {
  it("refuses to delete an entry an acquired item points at", async () => {
    const created = await createCharacter(FIGHTER, db);
    await updateCharacterRefs(created.id, { equipment: addItem([], AEGIS_REF) }, db);

    const result = await deleteHomebrewEntry("equipment", "aegis", db);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.blockedBy.map((one) => one.name)).toEqual(["Bruenor"]);
  });

  it("allows the delete once the item is dropped", async () => {
    const created = await createCharacter(FIGHTER, db);
    const carrying = await updateCharacterRefs(created.id, { equipment: addItem([], AEGIS_REF) }, db);
    await updateCharacterRefs(created.id, { equipment: removeItem(carrying?.equipment ?? [], AEGIS_REF) }, db);

    await expect(deleteHomebrewEntry("equipment", "aegis", db)).resolves.toEqual({ ok: true });
  });
});

describe("spells", () => {
  it("re-syncs on a spell ref changing too, not only on equipment", async () => {
    const spell = await saveHomebrewEntry(
      "spells",
      {
        name: "Ward",
        desc: ["A ward."],
        range: "Self",
        components: ["V"],
        ritual: false,
        duration: "1 minute",
        concentration: false,
        casting_time: "1 action",
        level: 1,
        school: { index: "abjuration", name: "Abjuration", url: "/api/magic-schools/abjuration" },
        classes: [],
        url: "/api/spells/ward",
        modifiers: [{ target: "ac", op: "add", value: 2, label: "Ward" }],
      },
      undefined,
      db,
    );
    expect(spell.ok).toBe(true);

    const created = await createCharacter(FIGHTER, db);
    const updated = await updateCharacterRefs(
      created.id,
      { spells: addSpell({ known: [], prepared: [] }, "homebrew:ward" as Ref) },
      db,
    );

    expect(updated?.modifiers.filter((one) => one.source === entryModifierSource("spells", "ward"))).toHaveLength(1);
  });
});

describe("what it leaves alone", () => {
  it("preserves the player's toggle across a later loadout change", async () => {
    const created = await createCharacter(FIGHTER, db);
    const carrying = await updateCharacterRefs(created.id, { equipment: addItem([], AEGIS_REF) }, db);

    // The player switches the ward off, then picks something else up. The
    // toggle goes through `updateCharacter`, which is the path production uses
    // — a toggle is not a ref change and owes no re-sync — so this exercises
    // the two writers against one another rather than only one of them.
    const toggled = (carrying?.modifiers ?? []).map((one) =>
      one.source === AEGIS_SOURCE ? { ...one, enabled: false } : one,
    );
    await updateCharacter(created.id, { modifiers: toggled }, db);

    const later = await updateCharacterRefs(
      created.id,
      { equipment: addItem(carrying?.equipment ?? [], "catalog:rope" as Ref) },
      db,
    );

    expect(later?.modifiers.find((one) => one.source === AEGIS_SOURCE)?.enabled).toBe(false);
  });

  it("leaves a homebrew-prefixed record it did not write, which no ref justifies either", async () => {
    const created = await createCharacter(
      {
        ...FIGHTER,
        // Two segments, not the three `entryModifierSource` writes: a record
        // the author supplied directly rather than one derived from an entry
        // this character references. The sweep must be able to tell them apart.
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
      },
      db,
    );

    const updated = await updateCharacterRefs(created.id, { equipment: addItem([], AEGIS_REF) }, db);

    expect(updated?.modifiers.map((one) => one.source)).toContain("homebrew:azure-ward");
  });

  it("returns undefined for a character that is already gone", async () => {
    await expect(updateCharacterRefs("c_missing", { equipment: [] }, db)).resolves.toBeUndefined();
  });
});

/**
 * The criterion #176 exists for: `derive()`'s armor and weapon path was
 * reachable only from a test, because nothing could put an item on a
 * character. This walks it the way a player does — acquire, equip, derive —
 * and builds the context through `loadDeriveContext` rather than by hand, so
 * a break anywhere between the drawer's write and the number on the sheet
 * fails here.
 */
/**
 * Narrows away the `undefined` an update returns for a character that is gone.
 * A test that reached through it with `!` would fail as a null deref several
 * lines later; this fails where the record went missing.
 */
function present(character: CharacterRecord | undefined): CharacterRecord {
  expect(character).toBeDefined();
  return character as CharacterRecord;
}

describe("the equip path, end to end", () => {
  beforeEach(async () => {
    await db.dnd_catalog_equipment.bulkPut([
      {
        index: "chain-mail",
        name: "Chain Mail",
        equipment_category: { index: "armor", name: "Armor", url: "/api/equipment-categories/armor" },
        armor_category: "Heavy",
        armor_class: { base: 16, dex_bonus: false },
      },
      {
        index: "longsword",
        name: "Longsword",
        equipment_category: { index: "weapon", name: "Weapon", url: "/api/equipment-categories/weapon" },
        damage: { damage_dice: "1d8", damage_type: { name: "Slashing" } },
      },
    ]);
  });

  it("moves AC once armor is acquired and equipped", async () => {
    const created = await createCharacter(FIGHTER, db);
    // Unarmored: 10 + DEX 0, from the default score of 10.
    expect(derive(created, await loadDeriveContext(created, db)).armorClass).toBe(10);

    const carrying = present(
      await updateCharacterRefs(created.id, { equipment: addItem([], "catalog:chain-mail" as Ref) }, db),
    );

    // Carried but not worn — picking armor up is not putting it on.
    expect(derive(carrying, await loadDeriveContext(carrying, db)).armorClass).toBe(10);

    const worn = present(
      await updateCharacterRefs(
        created.id,
        { equipment: toggleEquipped(carrying.equipment, "catalog:chain-mail" as Ref) },
        db,
      ),
    );

    expect(derive(worn, await loadDeriveContext(worn, db)).armorClass).toBe(16);
  });

  it("fills the attacks array from a weapon the player acquired", async () => {
    const created = await createCharacter(FIGHTER, db);
    expect(derive(created, await loadDeriveContext(created, db)).attacks).toEqual([]);

    const armed = present(
      await updateCharacterRefs(created.id, { equipment: addItem([], "catalog:longsword" as Ref) }, db),
    );

    // A sheathed sword is still something you can attack with, so this needs
    // no equip — `loadWeapons` deliberately ignores the flag.
    const [attack] = derive(armed, await loadDeriveContext(armed, db)).attacks;
    expect(attack).toMatchObject({ name: "Longsword", damageDice: "1d8" });
  });
});

/**
 * Two loadout writes racing each other.
 *
 * The drawers build a change from the `character` prop, which is only replaced
 * when a mutation settles and its invalidation lands. Two quick taps — the
 * quantity stepper is built for exactly that — therefore both compute from the
 * same pre-first-write snapshot, and a patch built that way silently discards
 * whichever landed first. Passing a FUNCTION of the stored record closes the
 * window, because the transaction has already read the current row.
 */
describe("concurrent loadout writes", () => {
  it("does not lose the first change when both are built from one stale snapshot", async () => {
    const created = await createCharacter(FIGHTER, db);
    const stale = created.equipment;

    // Both callers hold `stale` — neither has seen the other's write.
    await updateCharacterRefs(created.id, (current) => ({ equipment: addItem(current.equipment, AEGIS_REF) }), db);
    const second = await updateCharacterRefs(
      created.id,
      (current) => ({ equipment: addItem(current.equipment, "catalog:rope" as Ref) }),
      db,
    );

    expect(stale).toEqual([]);
    expect(second?.equipment.map((one) => one.itemRef).sort()).toEqual(["catalog:rope", AEGIS_REF]);
  });

  it("still accepts a plain patch, which is what a single settled write is", async () => {
    const created = await createCharacter(FIGHTER, db);

    const updated = await updateCharacterRefs(created.id, { equipment: addItem([], AEGIS_REF) }, db);

    expect(updated?.equipment.map((one) => one.itemRef)).toEqual([AEGIS_REF]);
  });
});
