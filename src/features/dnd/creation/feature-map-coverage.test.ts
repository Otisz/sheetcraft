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

/** The content-hashed filename means the catalog is found rather than named. */
function loadFeatures(): { index: string; name: string }[] {
  const filename = readdirSync(SRD_DIR).find((file) => file.startsWith("features."));
  if (!filename) {
    throw new Error("no vendored features catalog under public/srd");
  }
  return JSON.parse(readFileSync(join(SRD_DIR, filename), "utf8"));
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
  "unarmored-movement-2",
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

  it("leaves the overwhelming majority of the catalog as prose, as ADR-0004 says it does", () => {
    const mapped = features.filter((feature) => hasFeatureModifiers(feature.index));

    expect(mapped).toHaveLength(MAPPED.length);
    expect(features.length).toBeGreaterThan(400);
  });
});
