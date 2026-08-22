import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  newCharacterId,
  updateCharacter,
} from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { createTestDb, destroyTestDb } from "@/test/db";

let db: SheetcraftDb;

const FIGHTER = {
  name: "Bruenor",
  level: 4,
  classRef: "catalog:fighter",
  raceRef: "catalog:dwarf",
} as const;

beforeEach(() => {
  db = createTestDb("characters");
});

afterEach(async () => {
  await destroyTestDb(db);
});

describe("ids", () => {
  it("prefixes a UUID with c_", () => {
    expect(newCharacterId()).toMatch(/^c_[0-9a-f-]{36}$/);
  });

  it("does not collide", () => {
    const ids = new Set(Array.from({ length: 500 }, newCharacterId));
    expect(ids.size).toBe(500);
  });
});

describe("create", () => {
  it("stores and returns the character", async () => {
    const created = await createCharacter(FIGHTER, db);

    await expect(getCharacter(created.id, db)).resolves.toEqual(created);
    expect(created.name).toBe("Bruenor");
    expect(created.schemaVersion).toBe(1);
  });

  it("defaults the six base ability scores to 10", async () => {
    const created = await createCharacter(FIGHTER, db);

    expect(created.abilities).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
  });

  it("takes the base scores as entered", async () => {
    const created = await createCharacter({ ...FIGHTER, abilities: { str: 16, con: 16 } }, db);

    expect(created.abilities).toEqual({ str: 16, dex: 10, con: 16, int: 10, wis: 10, cha: 10 });
  });

  it("stores hit-die rolls per level, not a total", async () => {
    const created = await createCharacter({ ...FIGHTER, hpRolls: [10, 6, 8, 5] }, db);

    const stored = await getCharacter(created.id, db);
    expect(stored?.hpRolls).toEqual([10, 6, 8, 5]);
    expect(stored).not.toHaveProperty("maxHp");
  });

  it("declares currency in ascending value, since the sheet renders from Object.entries", async () => {
    const created = await createCharacter(FIGHTER, db);

    expect(Object.keys(created.play.currency)).toEqual(["cp", "sp", "ep", "gp", "pp"]);
    expect(created.play.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
  });

  it("defaults the optional refs to null rather than leaving them absent", async () => {
    const created = await createCharacter(FIGHTER, db);

    expect(created.subclassRef).toBeNull();
    expect(created.subraceRef).toBeNull();
    expect(created.backgroundRef).toBeNull();
    expect(created.alignment).toBeNull();
  });

  it("stores the racial modifier records the creation flow supplies", async () => {
    const created = await createCharacter(
      {
        ...FIGHTER,
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
      },
      db,
    );

    const stored = await getCharacter(created.id, db);
    expect(stored?.modifiers).toHaveLength(1);
    expect(stored?.modifiers[0].target).toBe("ability.con");
    // The bonus lives in the record, never in the stored score.
    expect(stored?.abilities.con).toBe(10);
  });

  it("defaults to no modifiers", async () => {
    const created = await createCharacter(FIGHTER, db);

    expect(created.modifiers).toEqual([]);
  });

  it("gives every character a distinct id", async () => {
    const first = await createCharacter(FIGHTER, db);
    const second = await createCharacter(FIGHTER, db);

    expect(first.id).not.toBe(second.id);
    await expect(db.dnd_characters.count()).resolves.toBe(2);
  });
});

describe("read", () => {
  it("returns undefined for an unknown id", async () => {
    await expect(getCharacter("c_nope", db)).resolves.toBeUndefined();
  });

  it("round-trips Dates as Dates", async () => {
    const created = await createCharacter(FIGHTER, db);

    const stored = await getCharacter(created.id, db);
    expect(stored?.createdAt).toBeInstanceOf(Date);
    expect(stored?.updatedAt).toBeInstanceOf(Date);
  });
});

describe("list", () => {
  it("is empty before anything is created", async () => {
    await expect(listCharacters(db)).resolves.toEqual([]);
  });

  it("returns most recently updated first", async () => {
    const first = await createCharacter({ ...FIGHTER, name: "First" }, db);
    const second = await createCharacter({ ...FIGHTER, name: "Second" }, db);

    // Stamp explicitly rather than relying on clock resolution between writes.
    await db.dnd_characters.update(first.id, { updatedAt: new Date(2_000) });
    await db.dnd_characters.update(second.id, { updatedAt: new Date(1_000) });

    await expect(listCharacters(db).then((all) => all.map((one) => one.name))).resolves.toEqual(["First", "Second"]);
  });
});

describe("update", () => {
  it("applies a partial change and leaves the rest alone", async () => {
    const created = await createCharacter(FIGHTER, db);

    const updated = await updateCharacter(created.id, { level: 5, name: "Bruenor Battlehammer" }, db);

    expect(updated?.level).toBe(5);
    expect(updated?.name).toBe("Bruenor Battlehammer");
    expect(updated?.classRef).toBe("catalog:fighter");
    await expect(getCharacter(created.id, db)).resolves.toEqual(updated);
  });

  it("stamps updatedAt and preserves createdAt and id", async () => {
    const created = await createCharacter(FIGHTER, db);
    await db.dnd_characters.update(created.id, { updatedAt: new Date(1_000) });

    const updated = await updateCharacter(created.id, { level: 5 }, db);

    expect(updated?.id).toBe(created.id);
    expect(updated?.createdAt).toEqual(created.createdAt);
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(1_000);
  });

  it("writes play state — the part that changes every session", async () => {
    const created = await createCharacter(FIGHTER, db);

    const updated = await updateCharacter(
      created.id,
      { play: { ...created.play, currentHp: 12, inspiration: true, currency: { cp: 0, sp: 0, ep: 0, gp: 25, pp: 0 } } },
      db,
    );

    expect(updated?.play.currentHp).toBe(12);
    expect(updated?.play.inspiration).toBe(true);
    expect(updated?.play.currency.gp).toBe(25);
  });

  it("returns undefined for an unknown id instead of creating one", async () => {
    await expect(updateCharacter("c_nope", { level: 2 }, db)).resolves.toBeUndefined();
    await expect(db.dnd_characters.count()).resolves.toBe(0);
  });
});

describe("delete", () => {
  it("removes the character", async () => {
    const created = await createCharacter(FIGHTER, db);

    await deleteCharacter(created.id, db);

    await expect(getCharacter(created.id, db)).resolves.toBeUndefined();
    await expect(listCharacters(db)).resolves.toEqual([]);
  });

  it("leaves other characters alone", async () => {
    const first = await createCharacter({ ...FIGHTER, name: "First" }, db);
    const second = await createCharacter({ ...FIGHTER, name: "Second" }, db);

    await deleteCharacter(first.id, db);

    await expect(listCharacters(db).then((all) => all.map((one) => one.name))).resolves.toEqual(["Second"]);
    expect(second.name).toBe("Second");
  });

  it("is idempotent", async () => {
    await expect(deleteCharacter("c_nope", db)).resolves.toBeUndefined();
  });
});

describe("starting hit points", () => {
  it("starts a new character at full health rather than at 0", async () => {
    // A character created at 0 hit points opens on the death-save panel, which
    // is the loudest possible lie about a character nobody has played yet.
    const character = await createCharacter({ ...FIGHTER, hpRolls: [10, 6, 6, 6] }, db);

    expect(character.play.currentHp).toBe(28);
  });

  it("counts the CON modifier, including one arriving as a racial record", async () => {
    const character = await createCharacter(
      {
        ...FIGHTER,
        level: 2,
        hpRolls: [10, 6],
        abilities: { con: 14 },
        modifiers: [
          {
            id: "race:dwarf:con",
            source: "race:dwarf",
            target: "ability.con",
            op: "add",
            value: 2,
            enabled: true,
            label: "Dwarf +2 CON",
          },
        ],
      },
      db,
    );

    // CON 14 + 2 = 16 → +3 per level, over two levels: 16 + 6 = 22.
    expect(character.play.currentHp).toBe(22);
  });

  it("still stores no temp hp and no death saves", async () => {
    const character = await createCharacter({ ...FIGHTER, hpRolls: [10] }, db);

    expect(character.play.tempHp).toBe(0);
    expect(character.play.deathSaves).toEqual({ successes: 0, failures: 0 });
  });
});
