import { describe, expect, it } from "vitest";
import { BACKUP_FORMAT, CURRENT_SCHEMA_VERSION, FORMAT_VERSION } from "@/features/dnd/backup/format";
import { parseBackup } from "@/features/dnd/backup/parse";
import { HOMEBREW_TYPE_ORDER } from "@/features/dnd/homebrew/types";

const CHARACTER = {
  id: "c_1",
  schemaVersion: 1,
  name: "Bruenor",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  level: 4,
  classRef: "catalog:fighter",
  subclassRef: null,
  raceRef: "catalog:dwarf",
  subraceRef: null,
  backgroundRef: null,
  alignment: null,
  abilities: { str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 },
  hpRolls: [10, 6, 6, 6],
  proficiencies: { skills: [], expertise: [], saves: [], armor: [], weapons: [], tools: [], languages: [] },
  equipment: [],
  spells: { known: [], prepared: [] },
  modifiers: [],
  play: {
    currentHp: 36,
    tempHp: 0,
    hitDiceSpent: 0,
    deathSaves: { successes: 0, failures: 0 },
    slotsExpended: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    conditions: [],
    inspiration: false,
    notes: "",
  },
};

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    format: BACKUP_FORMAT,
    formatVersion: FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: "2026-08-23T10:00:00.000Z",
    characters: [CHARACTER],
    homebrew: Object.fromEntries(HOMEBREW_TYPE_ORDER.map((type) => [type, []])),
    ...overrides,
  };
}

function parseText(value: unknown): ReturnType<typeof parseBackup> {
  return parseBackup(JSON.stringify(value));
}

describe("parseBackup", () => {
  it("accepts a file this build wrote", () => {
    const result = parseText(envelope());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.characters).toHaveLength(1);
    expect(result.file.characters[0].name).toBe("Bruenor");
  });

  it("revives dates, so an imported record carries Dates and not strings", () => {
    const result = parseText(envelope());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.characters[0].createdAt).toBeInstanceOf(Date);
    expect(result.file.characters[0].updatedAt.toISOString()).toBe("2026-08-02T00:00:00.000Z");
  });

  it("refuses a newer formatVersion rather than guessing at it", () => {
    const result = parseText(envelope({ formatVersion: FORMAT_VERSION + 1 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("newer-format");
    expect(result.message).toMatch(/newer version of Sheetcraft/i);
  });

  it("refuses a file that is not a Sheetcraft backup", () => {
    const result = parseText({ hello: "world" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not-a-backup");
  });

  it("refuses text that is not JSON at all", () => {
    const result = parseBackup("not json {");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unreadable");
  });

  it("refuses a backup whose characters are not a list", () => {
    const result = parseText(envelope({ characters: "Bruenor" }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("malformed");
  });

  it("defaults a missing homebrew group to empty rather than failing", () => {
    const result = parseText(envelope({ homebrew: { races: [] } }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const type of HOMEBREW_TYPE_ORDER) {
      expect(result.file.homebrew[type]).toEqual([]);
    }
  });

  it("migrates an older schemaVersion forward", () => {
    const result = parseText(envelope({ schemaVersion: 0, characters: [{ ...CHARACTER, schemaVersion: 0 }] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.characters[0].schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("preserves unknown fields, so a round-trip through an older build does not strip data", () => {
    const result = parseText(envelope({ characters: [{ ...CHARACTER, futureField: "kept" }] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.file.characters[0] as Record<string, unknown>).futureField).toBe("kept");
  });

  it("preserves an unknown envelope field, so a newer build's data is written back", () => {
    const result = parseText(envelope({ futureEnvelopeField: "kept" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.file as Record<string, unknown>).futureEnvelopeField).toBe("kept");
  });

  it("refuses a character missing the fields the sheet cannot render without", () => {
    const { classRef: _classRef, ...withoutClass } = CHARACTER;
    const result = parseText(envelope({ characters: [withoutClass] }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("malformed");
  });
});
