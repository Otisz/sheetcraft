import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCharacter } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import type { CharacterRecord, Modifier } from "@/features/dnd/db/schema";
import { derive, EMPTY_CONTEXT } from "@/features/dnd/derive";
import {
  entryModifierSource,
  entryModifiers,
  entryModifiersOf,
  syncAllEntryModifiers,
  syncEntryModifiers,
  validateEntryModifier,
  validateEntryModifiers,
} from "@/features/dnd/homebrew/entry-modifiers";
import { deleteHomebrewEntry, saveHomebrewEntry } from "@/features/dnd/homebrew/repository";
import { validateEntry } from "@/features/dnd/homebrew/validate";
import { createTestDb, destroyTestDb } from "@/test/db";

/**
 * The side-car, from three angles: what may be authored into it, what it
 * becomes on a character, and whether an edit to it reaches the characters
 * already holding it. See ADR-0006.
 */

const AC_BONUS = { target: "ac", op: "add", value: 1, label: "Storm Ward" } as const;

const SUBCLASS = {
  name: "Storm Herald",
  class: { index: "barbarian", name: "Barbarian", url: "/api/classes/barbarian" },
  subclass_flavor: "",
  desc: ["Level 3: Storm Aura."],
  subclass_levels: "/api/subclasses/storm-herald/levels",
  url: "/api/subclasses/storm-herald",
};

let db: SheetcraftDb;

beforeEach(() => {
  db = createTestDb("entry-modifiers");
});

afterEach(async () => {
  await destroyTestDb(db);
});

describe("validateEntryModifier", () => {
  it("accepts a record naming a target the engine derives", () => {
    expect(validateEntryModifier(AC_BONUS)).toEqual([]);
  });

  it("accepts a reference value, so it never goes stale", () => {
    expect(validateEntryModifier({ ...AC_BONUS, value: { ref: "mod.con" } })).toEqual([]);
  });

  it("refuses a target outside the closed vocabulary, naming the field", () => {
    const issues = validateEntryModifier({ ...AC_BONUS, target: "vibes" });

    expect(issues.map((one) => one.path)).toEqual(["target"]);
  });

  /**
   * The whole reason authoring-time validation exists: this record would throw
   * a `ModifierValidationError` on the character sheet instead, at the table.
   */
  it("refuses a reference outside the closed reference vocabulary", () => {
    const issues = validateEntryModifier({ ...AC_BONUS, value: { ref: "mod.luck" } });

    expect(issues.map((one) => one.path)).toEqual(["value.ref"]);
  });

  it("refuses an op the engine has no meaning for", () => {
    expect(validateEntryModifier({ ...AC_BONUS, op: "multiply" }).map((one) => one.path)).toEqual(["op"]);
  });

  /**
   * An empty box is a field not filled in, not an unknown vocabulary word.
   * Pointing the author at `mod.con` when they were about to type `2` reads as
   * the form having misunderstood them.
   */
  it("reports an empty value as missing rather than as an unknown reference", () => {
    const issues = validateEntryModifier({ ...AC_BONUS, value: { ref: "" } });

    expect(issues).toEqual([{ path: "value", message: "Say how much this changes the value by." }]);
  });

  it("refuses a record with no label, so the sheet can always say where a number came from", () => {
    expect(validateEntryModifier({ ...AC_BONUS, label: "  " }).map((one) => one.path)).toEqual(["label"]);
  });

  it("reports every bad field at once rather than stopping at the first", () => {
    const issues = validateEntryModifier({ target: "vibes", op: "multiply", value: "lots", label: "" });

    expect(issues.map((one) => one.path)).toEqual(["target", "op", "value", "label"]);
  });

  /**
   * `attack.*` is a real target whose weapon id comes from the character's own
   * equipment, so an entry cannot know whether it resolves. Accepting it here
   * is deliberate — an unresolved attack target is a miss the sheet renders.
   */
  it("accepts an attack target, which only a character can resolve", () => {
    expect(validateEntryModifier({ ...AC_BONUS, target: "attack.longsword.hit" })).toEqual([]);
  });
});

describe("validateEntryModifiers", () => {
  it("is silent about an absent side-car, which is what almost every entry has", () => {
    expect(validateEntryModifiers(undefined)).toEqual([]);
  });

  it("addresses an issue to its position, in the same grammar the schema uses", () => {
    const issues = validateEntryModifiers([AC_BONUS, { ...AC_BONUS, target: "vibes" }]);

    expect(issues.map((one) => one.path)).toEqual(["modifiers.1.target"]);
  });

  it("refuses a side-car that is not a list", () => {
    expect(validateEntryModifiers({ ac: 1 }).map((one) => one.path)).toEqual(["modifiers"]);
  });
});

describe("validateEntry — the side-car and the vendored schema", () => {
  /**
   * The acceptance criterion this ticket turns on. The vendored schemas are
   * `z.strictObject`, so before the side-car existed this entry failed
   * outright on an unknown `modifiers` key.
   */
  it("accepts an entry carrying modifier records", () => {
    const result = validateEntry("subclasses", { ...SUBCLASS, index: "storm-herald", modifiers: [AC_BONUS] });

    expect(result.ok).toBe(true);
  });

  it("hands the records back, rather than dropping them as an unknown key", () => {
    const result = validateEntry("subclasses", { ...SUBCLASS, index: "storm-herald", modifiers: [AC_BONUS] });

    expect(result.ok && result.entry.modifiers).toEqual([AC_BONUS]);
  });

  it("still refuses a malformed record, so the side-car is not an unchecked hole", () => {
    const result = validateEntry("subclasses", {
      ...SUBCLASS,
      index: "storm-herald",
      modifiers: [{ ...AC_BONUS, target: "vibes" }],
    });

    expect(result.ok).toBe(false);
  });

  /** The strict schema is untouched: an unknown key that is NOT a side-car still fails. */
  it("still refuses a genuinely unknown key", () => {
    const result = validateEntry("subclasses", { ...SUBCLASS, index: "storm-herald", power_level: 11 });

    expect(result.ok).toBe(false);
  });

  it("leaves a catalog-shaped entry with no side-car untouched", () => {
    const result = validateEntry("subclasses", { ...SUBCLASS, index: "storm-herald" });

    expect(result.ok && Object.hasOwn(result.entry, "modifiers")).toBe(false);
  });
});

describe("entryModifiers", () => {
  it("gives every record a source naming the entry it came from", () => {
    const [record] = entryModifiers("subclasses", { index: "storm-herald", modifiers: [AC_BONUS] });

    expect(record.source).toBe("homebrew:subclasses:storm-herald");
  });

  /**
   * Indexes are scoped per table, so a subclass and a race may share one. The
   * type in the source is what stops their records colliding on `modifierId`.
   */
  it("distinguishes two types sharing an index", () => {
    expect(entryModifierSource("subclasses", "stormborn")).not.toBe(entryModifierSource("races", "stormborn"));
  });

  /**
   * Where this parts company with ADR-0004's feature map: an SRD feature is
   * seeded off because the app cannot evaluate its condition, but an author
   * who wrote "+1 AC" meant +1 AC.
   */
  it("arrives enabled, because the author meant it", () => {
    const [record] = entryModifiers("subclasses", { index: "storm-herald", modifiers: [AC_BONUS] });

    expect(record.enabled).toBe(true);
  });

  it("contributes nothing for an entry with no side-car — which is every catalog row", () => {
    expect(entryModifiers("subclasses", { index: "berserker" })).toEqual([]);
  });

  it("drops a malformed record rather than throwing on the sheet that reads it", () => {
    const records = entryModifiers("subclasses", {
      index: "storm-herald",
      modifiers: [AC_BONUS, { target: "vibes", op: "add", value: 1, label: "Nope" }],
    });

    expect(records).toHaveLength(1);
  });

  it("keeps the first of two records fighting over one target", () => {
    const records = entryModifiers("subclasses", {
      index: "storm-herald",
      modifiers: [AC_BONUS, { ...AC_BONUS, value: 5, label: "Second" }],
    });

    expect(records.map((one) => one.value)).toEqual([1]);
  });
});

describe("entryModifiersOf", () => {
  it("reads an absent side-car as no records", () => {
    expect(entryModifiersOf({ index: "berserker" })).toEqual([]);
  });

  it("reads a side-car that is not a list as no records", () => {
    expect(entryModifiersOf({ modifiers: "lots" })).toEqual([]);
  });
});

describe("syncEntryModifiers", () => {
  const SOURCE = "homebrew:subclasses:storm-herald";

  function record(overrides: Partial<Modifier> = {}): Modifier {
    return {
      id: `${SOURCE}:ac`,
      source: SOURCE,
      target: "ac",
      op: "add",
      value: 1,
      enabled: true,
      label: "Storm Ward",
      ...overrides,
    };
  }

  /**
   * `enabled` is the player's flag and a re-derivation is not a player action.
   * An author fixing a label must not switch an effect back on.
   */
  it("carries the player's toggle across a re-sync", () => {
    const before = [record({ enabled: false })];

    const after = syncEntryModifiers(before, "subclasses", { index: "storm-herald", modifiers: [AC_BONUS] });

    expect(after[0].enabled).toBe(false);
  });

  it("drops a record the entry no longer authors", () => {
    const after = syncEntryModifiers([record()], "subclasses", { index: "storm-herald", modifiers: [] });

    expect(after).toEqual([]);
  });

  it("picks up the entry's new value", () => {
    const after = syncEntryModifiers([record()], "subclasses", {
      index: "storm-herald",
      modifiers: [{ ...AC_BONUS, value: 3 }],
    });

    expect(after[0].value).toBe(3);
  });

  /** Scoping the merge to one source is what keeps two entries independent. */
  it("leaves another entry's records alone", () => {
    const other = record({ id: "homebrew:races:azureborn:speed", source: "homebrew:races:azureborn", target: "speed" });

    const after = syncEntryModifiers([other], "subclasses", { index: "storm-herald", modifiers: [AC_BONUS] });

    expect(after).toContainEqual(other);
  });

  it("leaves racial, feature and override records alone", () => {
    const untouched: Modifier[] = [
      record({ id: "race:catalog:dwarf:ability.con", source: "race:catalog:dwarf", target: "ability.con" }),
      record({ id: "feature:rage:ac", source: "feature:rage" }),
      record({ id: "override:ac", source: "override", op: "set" }),
    ];

    const after = syncEntryModifiers(untouched, "subclasses", { index: "storm-herald", modifiers: [AC_BONUS] });

    expect(after).toEqual(expect.arrayContaining(untouched));
  });
});

describe("a character taking an entry that carries modifiers", () => {
  async function storeSubclass(modifiers: unknown[]): Promise<string> {
    const result = await saveHomebrewEntry("subclasses", { ...SUBCLASS, modifiers }, undefined, db);
    if (!result.ok) {
      throw new Error(`fixture failed to save: ${JSON.stringify(result.issues)}`);
    }
    return result.entry.index;
  }

  async function createTaking(index: string): Promise<CharacterRecord> {
    return createCharacter(
      {
        name: "Zephyr",
        level: 3,
        classRef: "catalog:barbarian",
        raceRef: "catalog:human",
        subclassRef: `homebrew:${index}`,
        hpRolls: [10, 6, 6],
      },
      db,
    );
  }

  it("receives the entry's records", async () => {
    const index = await storeSubclass([AC_BONUS]);

    const character = await createTaking(index);

    expect(character.modifiers).toContainEqual(
      expect.objectContaining({ source: `homebrew:subclasses:${index}`, target: "ac", value: 1 }),
    );
  });

  it("shows them in the derived value, which is the point of authoring one", async () => {
    const index = await storeSubclass([AC_BONUS]);

    const character = await createTaking(index);
    const bare = { ...character, modifiers: [] };

    expect(derive(character, EMPTY_CONTEXT).armorClass).toBe(derive(bare, EMPTY_CONTEXT).armorClass + 1);
  });

  /**
   * The interchangeability criterion: a catalog entry carries no side-car, and
   * a character taking one must be exactly as it was before this ticket.
   */
  it("is unaffected by a catalog subclass, which carries none", async () => {
    const character = await createCharacter(
      {
        name: "Alys",
        level: 3,
        classRef: "catalog:barbarian",
        raceRef: "catalog:human",
        subclassRef: "catalog:berserker",
      },
      db,
    );

    expect(character.modifiers.some((one) => one.source.startsWith("homebrew:"))).toBe(false);
  });

  it("takes nothing from an entry whose side-car is empty", async () => {
    const index = await storeSubclass([]);

    const character = await createTaking(index);

    expect(character.modifiers.some((one) => one.source.startsWith("homebrew:"))).toBe(false);
  });
});

describe("editing an entry's modifiers propagates to referencing characters", () => {
  async function setup(modifiers: unknown[]) {
    const created = await saveHomebrewEntry("subclasses", { ...SUBCLASS, modifiers }, undefined, db);
    if (!created.ok) {
      throw new Error("fixture failed to save");
    }
    const index = created.entry.index;

    const character = await createCharacter(
      {
        name: "Zephyr",
        level: 3,
        classRef: "catalog:barbarian",
        raceRef: "catalog:human",
        subclassRef: `homebrew:${index}`,
      },
      db,
    );

    return { index, characterId: character.id };
  }

  async function reload(id: string): Promise<CharacterRecord> {
    const character = await db.dnd_characters.get(id);
    if (!character) {
      throw new Error("character vanished");
    }
    return character;
  }

  /** The #165 live-edit behaviour, honoured for a stored record. */
  it("carries a changed value onto the character", async () => {
    const { index, characterId } = await setup([AC_BONUS]);

    await saveHomebrewEntry("subclasses", { ...SUBCLASS, modifiers: [{ ...AC_BONUS, value: 4 }] }, index, db);

    const character = await reload(characterId);
    expect(character.modifiers.find((one) => one.source.endsWith(index))?.value).toBe(4);
  });

  it("removes a record the author deleted", async () => {
    const { index, characterId } = await setup([AC_BONUS]);

    await saveHomebrewEntry("subclasses", { ...SUBCLASS, modifiers: [] }, index, db);

    const character = await reload(characterId);
    expect(character.modifiers.some((one) => one.source.startsWith("homebrew:"))).toBe(false);
  });

  it("adds a record the author added after the character was made", async () => {
    const { index, characterId } = await setup([]);

    await saveHomebrewEntry("subclasses", { ...SUBCLASS, modifiers: [AC_BONUS] }, index, db);

    const character = await reload(characterId);
    expect(character.modifiers.some((one) => one.source.endsWith(index))).toBe(true);
  });

  it("does not switch an effect back on that the player turned off", async () => {
    const { index, characterId } = await setup([AC_BONUS]);

    const before = await reload(characterId);
    await db.dnd_characters.put({
      ...before,
      modifiers: before.modifiers.map((one) => (one.source.endsWith(index) ? { ...one, enabled: false } : one)),
    });

    await saveHomebrewEntry(
      "subclasses",
      { ...SUBCLASS, modifiers: [{ ...AC_BONUS, label: "Storm Warding" }] },
      index,
      db,
    );

    const after = await reload(characterId);
    expect(after.modifiers.find((one) => one.source.endsWith(index))?.enabled).toBe(false);
  });

  /**
   * An edit that moved no record must not restamp `updatedAt`, which is the
   * character list's sort key — a prose fix would otherwise reorder the list
   * for a change nobody can see.
   */
  it("leaves a character untouched when the edit changed no record", async () => {
    const { index, characterId } = await setup([AC_BONUS]);
    const before = await reload(characterId);

    await saveHomebrewEntry(
      "subclasses",
      { ...SUBCLASS, desc: ["Level 3: Storm Aura, revised."], modifiers: [AC_BONUS] },
      index,
      db,
    );

    const after = await reload(characterId);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it("leaves a character that does not reference the entry alone", async () => {
    const { index } = await setup([AC_BONUS]);
    const other = await createCharacter(
      { name: "Alys", level: 3, classRef: "catalog:barbarian", raceRef: "catalog:human" },
      db,
    );

    await saveHomebrewEntry("subclasses", { ...SUBCLASS, modifiers: [{ ...AC_BONUS, value: 4 }] }, index, db);

    const after = await reload(other.id);
    expect(after.modifiers.some((one) => one.source.startsWith("homebrew:"))).toBe(false);
  });
});

/**
 * The delete block is a scan of character REFS, and a modifier is not a ref —
 * so records neither strengthen nor weaken it. Asserted rather than assumed,
 * because "an entry with modifiers is exactly as deletable as one without" is
 * the kind of claim that is true until someone adds a special case.
 */
describe("deleting an entry that carries modifiers", () => {
  async function storeAndTake() {
    const created = await saveHomebrewEntry("subclasses", { ...SUBCLASS, modifiers: [AC_BONUS] }, undefined, db);
    if (!created.ok) {
      throw new Error("fixture failed to save");
    }

    await createCharacter(
      {
        name: "Zephyr",
        level: 3,
        classRef: "catalog:barbarian",
        raceRef: "catalog:human",
        subclassRef: `homebrew:${created.entry.index}`,
      },
      db,
    );

    return created.entry.index;
  }

  it("is refused while a character references it", async () => {
    const index = await storeAndTake();

    const result = await deleteHomebrewEntry("subclasses", index, db);

    expect(result.ok).toBe(false);
  });

  it("names the character in the refusal, as it does for any other entry", async () => {
    const index = await storeAndTake();

    const result = await deleteHomebrewEntry("subclasses", index, db);

    expect(!result.ok && result.blockedBy.map((one) => one.name)).toEqual(["Zephyr"]);
  });

  it("leaves the entry in place when it refuses", async () => {
    const index = await storeAndTake();

    await deleteHomebrewEntry("subclasses", index, db);

    expect(await db.dnd_homebrew_subclasses.get(index)).toBeDefined();
  });

  it("goes through once nothing references it", async () => {
    const created = await saveHomebrewEntry("subclasses", { ...SUBCLASS, modifiers: [AC_BONUS] }, undefined, db);

    const result = await deleteHomebrewEntry("subclasses", created.ok ? created.entry.index : "", db);

    expect(result.ok).toBe(true);
  });
});

describe("syncAllEntryModifiers", () => {
  /**
   * A ref whose entry is gone already renders as `⚠ unknown`. Its records go
   * with it — a number left behind by an entry nobody can open is one nothing
   * on the sheet can explain.
   */
  it("drops the records of an entry that has been deleted", async () => {
    const character: CharacterRecord = {
      ...(await createCharacter(
        { name: "Zephyr", level: 3, classRef: "catalog:barbarian", raceRef: "catalog:human" },
        db,
      )),
      subclassRef: "homebrew:gone",
      modifiers: [
        {
          id: "homebrew:subclasses:gone:ac",
          source: "homebrew:subclasses:gone",
          target: "ac",
          op: "add",
          value: 1,
          enabled: true,
          label: "Ghost",
        },
      ],
    };

    const modifiers = await syncAllEntryModifiers(character, db);

    expect(modifiers).toEqual([]);
  });
});
