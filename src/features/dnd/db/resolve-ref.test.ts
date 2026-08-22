import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { refIndex, refSource, resolveRef } from "@/features/dnd/db/resolve-ref";
import { createTestDb, destroyTestDb } from "@/test/db";

let db: SheetcraftDb;

beforeEach(async () => {
  db = createTestDb("resolve-ref");
  await db.dnd_catalog_races.bulkPut([{ index: "human", name: "Human" }]);
  await db.dnd_homebrew_races.bulkPut([{ index: "azureborn", name: "Azureborn", updatedAt: new Date() }]);
});

afterEach(async () => {
  await destroyTestDb(db);
});

describe("parsing", () => {
  // The parser is module-private on purpose — exporting it would re-open the
  // seam CONTEXT.md § Catalog reference closes. Asserted through resolveRef.
  it("splits on the first separator only, so a colon may appear in the index", async () => {
    await db.dnd_catalog_races.put({ index: "a:b", name: "Colonised" });

    const resolution = await resolveRef("races", "catalog:a:b", db);

    expect(resolution.found && resolution.entry.name).toBe("Colonised");
    expect(resolution.index).toBe("a:b");
  });

  it.each(["human", "catalog:", ":human", "srd:human", ""])("rejects %o as malformed", async (ref) => {
    await expect(resolveRef("races", ref, db)).resolves.toMatchObject({ reason: "malformed" });
  });
});

describe("resolveRef", () => {
  it("resolves a catalog ref", async () => {
    const resolution = await resolveRef("races", "catalog:human", db);

    expect(resolution.found).toBe(true);
    expect(resolution.found && resolution.entry.name).toBe("Human");
    expect(resolution.source).toBe("catalog");
  });

  it("resolves a homebrew ref", async () => {
    const resolution = await resolveRef("races", "homebrew:azureborn", db);

    expect(resolution.found).toBe(true);
    expect(resolution.found && resolution.entry.name).toBe("Azureborn");
  });

  it("lets catalog and homebrew share an index — the prefix disambiguates", async () => {
    await db.dnd_homebrew_races.put({ index: "human", name: "Human (homebrew)", updatedAt: new Date() });

    const fromCatalog = await resolveRef("races", "catalog:human", db);
    const fromHomebrew = await resolveRef("races", "homebrew:human", db);

    expect(fromCatalog.found && fromCatalog.entry.name).toBe("Human");
    expect(fromHomebrew.found && fromHomebrew.entry.name).toBe("Human (homebrew)");
  });

  it("returns a miss for a dangling ref rather than throwing", async () => {
    const resolution = await resolveRef("races", "catalog:tiefling", db);

    expect(resolution).toEqual({ found: false, source: "catalog", index: "tiefling", reason: "missing" });
  });

  it("returns a miss for a malformed ref, carrying the raw string for rendering", async () => {
    const resolution = await resolveRef("races", "human", db);

    expect(resolution).toEqual({ found: false, source: null, index: "human", reason: "malformed" });
  });

  it("returns a miss for a homebrew ref to a type with no homebrew mirror", async () => {
    const resolution = await resolveRef("levels", "homebrew:whatever", db);

    expect(resolution).toEqual({ found: false, source: "homebrew", index: "whatever", reason: "not-authorable" });
  });

  it("never throws for any unresolvable input", async () => {
    const refs = ["", ":", "catalog:", "nonsense", "homebrew:missing", "catalog:missing"];

    for (const ref of refs) {
      await expect(resolveRef("races", ref, db)).resolves.toMatchObject({ found: false });
    }
  });
});

/**
 * The accessors exist so that nothing above this module has to split a ref
 * itself. CONTEXT.md § Catalog reference: parsed in exactly one place.
 */
describe("refIndex", () => {
  it("returns the index of a well-formed ref, whichever table it names", () => {
    expect(refIndex("catalog:human")).toBe("human");
    expect(refIndex("homebrew:azureborn")).toBe("azureborn");
  });

  it("rejects a prefix-less string rather than treating the whole thing as an index", () => {
    expect(refIndex("human")).toBeNull();
  });

  it.each(["", "catalog:", ":human", "nonsense:human", null])("rejects %o", (ref) => {
    expect(refIndex(ref as string | null)).toBeNull();
  });
});

describe("refSource", () => {
  it("names the table a ref selects", () => {
    expect(refSource("catalog:human")).toBe("catalog");
    expect(refSource("homebrew:azureborn")).toBe("homebrew");
  });

  it("returns null for anything malformed", () => {
    expect(refSource("human")).toBeNull();
    expect(refSource(null)).toBeNull();
  });
});
