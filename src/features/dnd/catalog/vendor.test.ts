import { describe, expect, it } from "vitest";
import type { CatalogId } from "@/features/dnd/catalog/manifest";
import { CATALOGS, TIER_1 } from "@/features/dnd/catalog/manifest";
import { buildManifest, contentHash, hashedFilename } from "@/features/dnd/catalog/vendor";

const SHA = "bfd3db4bcc31699cce703b46feb9af3f0ff08999";

/** A byte source for one catalog id, so a fixture never touches the network. */
function bytesFor(id: string): Uint8Array {
  return new TextEncoder().encode(`[{"index":"${id}"}]`);
}

/** A sorted copy — `toSorted` is ES2023 and the project targets ES2022. */
function sorted(values: readonly string[]): string[] {
  return values.slice().sort();
}

/** Every catalog, filled with distinct fixture bytes. */
function fixtureSources(): Map<CatalogId, Uint8Array> {
  return new Map(CATALOGS.map((catalog) => [catalog.id, bytesFor(catalog.id)]));
}

describe("contentHash", () => {
  // A known-good SHA-256, taken from `printf 'sheetcraft' | sha256sum`, not
  // recomputed the way the implementation does.
  it("is the SHA-256 of the bytes, hex-encoded", () => {
    const hash = contentHash(new TextEncoder().encode("sheetcraft"));

    expect(hash).toBe("8916d23776511797b9d8662fb946a4c7989464a5aaa74394c7c96398e5607914");
  });

  it("differs when a single byte differs", () => {
    expect(contentHash(bytesFor("a"))).not.toBe(contentHash(bytesFor("b")));
  });
});

describe("hashedFilename", () => {
  it("carries the catalog id and a hash prefix, so it is immutably cacheable", () => {
    const filename = hashedFilename("races", bytesFor("races"));

    expect(filename).toMatch(/^races\.[0-9a-f]{16}\.json$/);
  });

  it("is stable for identical bytes and changes when the bytes change", () => {
    const stable = hashedFilename("races", bytesFor("races"));

    expect(hashedFilename("races", bytesFor("races"))).toBe(stable);
    expect(hashedFilename("races", bytesFor("other"))).not.toBe(stable);
  });
});

describe("buildManifest", () => {
  it("records the pinned upstream SHA", () => {
    const manifest = buildManifest({ sha: SHA, version: 1, sources: fixtureSources() });

    expect(manifest.upstream.sha).toBe(SHA);
  });

  it("carries a single global version, not one per catalog", () => {
    const manifest = buildManifest({ sha: SHA, version: 7, sources: fixtureSources() });

    expect(manifest.version).toBe(7);
    expect(manifest.catalogs.every((entry) => !("version" in entry))).toBe(true);
  });

  it("lists id, filename, bytes and tier for every catalog", () => {
    const manifest = buildManifest({ sha: SHA, version: 1, sources: fixtureSources() });
    const races = manifest.catalogs.find((entry) => entry.id === "races");

    expect(races).toEqual({
      id: "races",
      filename: hashedFilename("races", bytesFor("races")),
      bytes: bytesFor("races").byteLength,
      tier: 1,
    });
  });

  it("puts exactly classes, subclasses, races, subraces and levels in tier 1", () => {
    const manifest = buildManifest({ sha: SHA, version: 1, sources: fixtureSources() });
    const tierOne = manifest.catalogs.filter((entry) => entry.tier === 1).map((entry) => entry.id);

    expect(sorted(tierOne)).toEqual(sorted([...TIER_1]));
    expect(sorted(tierOne)).toEqual(["classes", "levels", "races", "subclasses", "subraces"]);
  });

  it("assigns tier 2 to everything else, so every catalog is placed", () => {
    const manifest = buildManifest({ sha: SHA, version: 1, sources: fixtureSources() });

    expect(manifest.catalogs).toHaveLength(CATALOGS.length);
    expect(manifest.catalogs.every((entry) => entry.tier === 1 || entry.tier === 2)).toBe(true);
  });

  it("is byte-identical when rebuilt from unchanged sources — the no-diff guarantee", () => {
    const first = buildManifest({ sha: SHA, version: 1, sources: fixtureSources() });
    const second = buildManifest({ sha: SHA, version: 1, sources: fixtureSources() });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("orders catalogs by id, so source insertion order cannot reorder the manifest", () => {
    const reversed = new Map([...fixtureSources()].reverse());

    const manifest = buildManifest({ sha: SHA, version: 1, sources: reversed });
    const ids = manifest.catalogs.map((entry) => entry.id);

    expect(ids).toEqual(sorted(ids));
  });

  it("refuses to build when a catalog has no source, rather than emitting a partial manifest", () => {
    const incomplete = fixtureSources();
    incomplete.delete("spells");

    expect(() => buildManifest({ sha: SHA, version: 1, sources: incomplete })).toThrow(/spells/);
  });
});
