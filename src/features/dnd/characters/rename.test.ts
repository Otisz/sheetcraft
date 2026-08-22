import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeCharacterName, renameCharacter } from "@/features/dnd/characters/rename";
import { createCharacter, getCharacter } from "@/features/dnd/db/characters-repository";
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

  it("returns undefined for a character that is already gone", async () => {
    await expect(renameCharacter("c_nope", "Ghost", db)).resolves.toBeUndefined();
  });
});
