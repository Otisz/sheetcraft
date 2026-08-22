import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIGHTER } from "@/features/dnd/characters/fixtures";
import { listCharacterSummaries } from "@/features/dnd/characters/list";
import { normalizeCharacterName, renameCharacter } from "@/features/dnd/characters/rename";
import { createCharacter, getCharacter } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { createTestDb, destroyTestDb } from "@/test/db";

let db: SheetcraftDb;

beforeEach(() => {
  db = createTestDb("rename");
});

afterEach(async () => {
  await destroyTestDb(db);
});

describe("normalizeCharacterName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeCharacterName("  Bruenor  ")).toBe("Bruenor");
  });

  it.each(["", "   ", "\n\t"])("rejects %o as blank", (name) => {
    expect(normalizeCharacterName(name)).toBeNull();
  });

  it("keeps interior punctuation and spacing as typed", () => {
    expect(normalizeCharacterName("Bruenor  O'Battlehammer")).toBe("Bruenor  O'Battlehammer");
  });
});

describe("renameCharacter", () => {
  it("stores the trimmed name and stamps updatedAt", async () => {
    const created = await createCharacter(FIGHTER, db);
    await db.dnd_characters.update(created.id, { updatedAt: new Date(1_000) });

    const renamed = await renameCharacter(created.id, "  Bruenor Battlehammer ", db);

    expect(renamed?.name).toBe("Bruenor Battlehammer");
    expect(renamed?.updatedAt.getTime()).toBeGreaterThan(1_000);
    await expect(getCharacter(created.id, db)).resolves.toEqual(renamed);
  });

  // A blank rename is a no-op rather than an exception: the caller is a form
  // that disables its submit, and a lost name is unrecoverable.
  it("leaves the stored name alone when the new one is blank", async () => {
    const created = await createCharacter(FIGHTER, db);

    await expect(renameCharacter(created.id, "   ", db)).resolves.toBeUndefined();

    await expect(getCharacter(created.id, db).then((one) => one?.name)).resolves.toBe("Bruenor");
  });

  // `updatedAt` is what the list sorts on, so a rename moves that character to
  // the top. Asserted through the projection, since that is what the row shows.
  it("moves the renamed character to the front of the list", async () => {
    const first = await createCharacter({ ...FIGHTER, name: "First" }, db);
    const second = await createCharacter({ ...FIGHTER, name: "Second" }, db);
    await db.dnd_characters.update(first.id, { updatedAt: new Date(1_000) });
    await db.dnd_characters.update(second.id, { updatedAt: new Date(2_000) });

    await renameCharacter(first.id, "First Renamed", db);

    const names = (await listCharacterSummaries(db)).map((one) => one.name);
    expect(names).toEqual(["First Renamed", "Second"]);
  });

  it("returns undefined for a character that is already gone", async () => {
    await expect(renameCharacter("c_nope", "Ghost", db)).resolves.toBeUndefined();
  });
});
