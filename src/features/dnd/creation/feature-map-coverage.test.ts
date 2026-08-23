/**
 * The map is keyed by feature `index`, so a typo in a key is a record that is
 * never written and a toggle that never appears — a silent failure, and the
 * exact one a closed vocabulary exists to prevent everywhere else.
 *
 * This checks every key against the **vendored SRD catalog itself**, read off
 * disk rather than transcribed, so a re-pin that renames a feature fails here
 * instead of at a table.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasFeatureModifiers } from "@/features/dnd/creation/feature-modifiers";

const SRD_DIR = join(process.cwd(), "public", "srd");

/** The content-hashed filename means a catalog is found rather than named. */
function loadCatalog<T>(prefix: string): T[] {
  const filename = readdirSync(SRD_DIR).find((file) => file.startsWith(`${prefix}.`));
  if (!filename) {
    throw new Error(`no vendored ${prefix} catalog under public/srd`);
  }
  return JSON.parse(readFileSync(join(SRD_DIR, filename), "utf8"));
}

function loadFeatures(): { index: string; name: string }[] {
  return loadCatalog("features");
}

/** The per-level rows, where the monk's speed scaling actually lives. */
function loadLevels(): {
  level: number;
  class?: { index: string };
  class_specific?: { unarmored_movement?: number };
}[] {
  return loadCatalog("levels");
}

/**
 * Every index the map claims. Read back through `hasFeatureModifiers` rather
 * than by exporting the table, so the map stays private to its module.
 */
const MAPPED = [
  "barbarian-unarmored-defense",
  "monk-unarmored-defense",
  "fast-movement",
  "unarmored-movement-1",
  "fighter-fighting-style-defense",
  "fighting-style-defense",
  "ranger-fighting-style-defense",
  "defensive-tactics-multiattack-defense",
  "draconic-resilience",
];

describe("the feature modifier map", () => {
  const features = loadFeatures();
  const indexes = new Set(features.map((feature) => feature.index));

  it.each(MAPPED)("names %s, which the vendored catalog actually has", (index) => {
    expect(indexes.has(index)).toBe(true);
    expect(hasFeatureModifiers(index)).toBe(true);
  });

  it("keys the two Unarmored Defenses separately, though they share a name", () => {
    const named = features.filter((feature) => feature.name === "Unarmored Defense");

    expect(named.map((feature) => feature.index).sort()).toEqual([
      "barbarian-unarmored-defense",
      "monk-unarmored-defense",
    ]);
  });

  /**
   * The one feature row this map is asked for most often and must keep
   * refusing. The SRD ships `unarmored-movement-2` at level 9, but the monk's
   * speed scaling lives in the `Levels` table and steps at 2/6/10/14/18 — so a
   * record read off the 9th-level row would be a number nothing in the rules
   * grants. Asserted against the vendored table rather than argued in a
   * comment, because a re-pin is exactly when someone would re-add it.
   */
  it("writes no record for unarmored-movement-2, whose level does not match the speed table", () => {
    expect(hasFeatureModifiers("unarmored-movement-2")).toBe(false);
    expect(indexes.has("unarmored-movement-2")).toBe(true);

    const levels = loadLevels();
    const stepsAt = levels
      .filter((row) => row.class?.index === "monk")
      .filter((row, _index, rows) => {
        const previous = rows.find((one) => one.level === row.level - 1);
        return (
          previous !== undefined &&
          row.class_specific?.unarmored_movement !== previous.class_specific?.unarmored_movement
        );
      })
      .map((row) => row.level);

    // The speed moves at 6, never at 9 — where the feature row sits.
    expect(stepsAt).toContain(6);
    expect(stepsAt).not.toContain(9);
  });

  it("leaves the overwhelming majority of the catalog as prose, as ADR-0004 says it does", () => {
    const mapped = features.filter((feature) => hasFeatureModifiers(feature.index));

    expect(mapped).toHaveLength(MAPPED.length);
    expect(features.length).toBeGreaterThan(400);
  });
});
