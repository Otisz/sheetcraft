import { describe, expect, it } from "vitest";
import {
  type FeatureSource,
  featureModifiers,
  hasFeatureModifiers,
  syncFeatureModifiers,
} from "@/features/dnd/creation/feature-modifiers";
import type { Modifier } from "@/features/dnd/db/schema";

/**
 * SRD features become modifier records through a hand-authored map keyed by
 * feature `index`. The entries below are trimmed transcriptions of the SRD
 * rows, so the expected records are read off the rulebook rather than off the
 * code. See ADR-0004.
 */

const BARBARIAN_UNARMORED: FeatureSource = { index: "barbarian-unarmored-defense", name: "Unarmored Defense" };
const MONK_UNARMORED: FeatureSource = { index: "monk-unarmored-defense", name: "Unarmored Defense" };
const RAGE: FeatureSource = { index: "rage", name: "Rage" };
const FAST_MOVEMENT: FeatureSource = { index: "fast-movement", name: "Fast Movement" };
const DRACONIC_RESILIENCE: FeatureSource = { index: "draconic-resilience", name: "Draconic Resilience" };

describe("featureModifiers", () => {
  it("gives a barbarian's Unarmored Defense a CON add against ac", () => {
    const modifiers = featureModifiers([BARBARIAN_UNARMORED]);

    expect(modifiers).toHaveLength(1);
    expect(modifiers[0]).toMatchObject({
      source: "feature:barbarian-unarmored-defense",
      target: "ac",
      op: "add",
      value: { ref: "mod.con" },
    });
  });

  it("derives the monk variant from WIS, not CON — one map, two correct formulas", () => {
    const [monk] = featureModifiers([MONK_UNARMORED]);

    expect(monk).toMatchObject({ target: "ac", op: "add", value: { ref: "mod.wis" } });
  });

  it("seeds every feature record disabled — the app does not evaluate the condition", () => {
    const modifiers = featureModifiers([BARBARIAN_UNARMORED, FAST_MOVEMENT]);

    expect(modifiers.every((modifier) => modifier.enabled)).toBe(false);
    expect(modifiers.map((modifier) => modifier.enabled)).toEqual([false, false]);
  });

  it("drops a feature that changes no number this app derives", () => {
    expect(featureModifiers([RAGE])).toEqual([]);
    expect(hasFeatureModifiers(RAGE.index)).toBe(false);
  });

  it("emits one record per target when a feature moves two values", () => {
    const modifiers = featureModifiers([DRACONIC_RESILIENCE]);

    expect(modifiers.map((modifier) => modifier.target).sort()).toEqual(["ac", "maxHp"]);
  });

  it("derives ids from source and target, so the same feature is the same record every time", () => {
    const once = featureModifiers([BARBARIAN_UNARMORED]);
    const twice = featureModifiers([BARBARIAN_UNARMORED]);

    expect(once).toEqual(twice);
    expect(once[0].id).toBe("feature:barbarian-unarmored-defense:ac");
  });

  it("labels a record with the feature's own name, so the pill reads as the rulebook does", () => {
    const [record] = featureModifiers([BARBARIAN_UNARMORED]);

    expect(record.label).toBe("Unarmored Defense");
  });

  it("takes each feature once, even if the caller passes a duplicate", () => {
    expect(featureModifiers([BARBARIAN_UNARMORED, BARBARIAN_UNARMORED])).toHaveLength(1);
  });
});

describe("syncFeatureModifiers", () => {
  const existing = (over: Partial<Modifier> = {}): Modifier => ({
    id: "feature:barbarian-unarmored-defense:ac",
    source: "feature:barbarian-unarmored-defense",
    target: "ac",
    op: "add",
    value: { ref: "mod.con" },
    enabled: true,
    label: "Unarmored Defense",
    ...over,
  });

  it("keeps a feature record's toggle across a re-derivation", () => {
    const merged = syncFeatureModifiers([existing()], [BARBARIAN_UNARMORED]);

    expect(merged).toHaveLength(1);
    expect(merged[0].enabled).toBe(true);
  });

  it("adds the records a newly gained feature brings", () => {
    const merged = syncFeatureModifiers([existing()], [BARBARIAN_UNARMORED, FAST_MOVEMENT]);

    expect(merged.map((modifier) => modifier.source)).toContain("feature:fast-movement");
  });

  it("drops a feature record the character no longer has", () => {
    const merged = syncFeatureModifiers([existing()], [MONK_UNARMORED]);

    expect(merged.map((modifier) => modifier.source)).toEqual(["feature:monk-unarmored-defense"]);
  });

  it("leaves every non-feature record untouched", () => {
    const racial: Modifier = {
      id: "race:catalog:dwarf:ability.con",
      source: "race:catalog:dwarf",
      target: "ability.con",
      op: "add",
      value: 2,
      enabled: true,
      label: "Dwarf +2 CON",
    };

    const merged = syncFeatureModifiers([racial], [BARBARIAN_UNARMORED]);

    expect(merged).toContainEqual(racial);
  });

  it("leaves a homebrew record the player authored alone — nothing is special-cased for SRD", () => {
    const homebrew: Modifier = {
      id: "homebrew:azure-ward:ac",
      source: "homebrew:azure-ward",
      target: "ac",
      op: "add",
      value: 2,
      enabled: true,
      label: "Azure Ward",
    };

    const merged = syncFeatureModifiers([homebrew], [BARBARIAN_UNARMORED]);

    expect(merged).toContainEqual(homebrew);
  });

  it("keeps an override on a target a feature also moves — they are different records", () => {
    const override: Modifier = {
      id: "override:ac",
      source: "override",
      target: "ac",
      op: "set",
      value: 18,
      enabled: true,
      label: "AC override",
    };

    const merged = syncFeatureModifiers([override], [BARBARIAN_UNARMORED]);

    expect(merged).toContainEqual(override);
  });
});
