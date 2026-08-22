import { describe, expect, it } from "vitest";
import { parseHomebrewJson, validateEntry } from "@/features/dnd/homebrew/validate";

/** A schema-valid subrace — the smallest real entry in the vendored set. */
const SUBRACE = {
  index: "azure-dwarf",
  name: "Azure Dwarf",
  race: { index: "dwarf", name: "Dwarf", url: "/api/races/dwarf" },
  desc: "Dwarves of the deep blue.",
  ability_bonuses: [{ ability_score: { index: "con", name: "CON", url: "/api/ability-scores/con" }, bonus: 2 }],
  url: "/api/subraces/azure-dwarf",
};

describe("validateEntry", () => {
  it("accepts an entry matching its vendored catalog schema", () => {
    const result = validateEntry("subraces", SUBRACE);

    expect(result.ok).toBe(true);
  });

  it("hands back the parsed entry, so the caller stores what the schema saw", () => {
    const result = validateEntry("subraces", SUBRACE);

    expect(result.ok && result.entry.index).toBe("azure-dwarf");
  });

  it("reports a missing field against the path it is missing from", () => {
    const { name: _dropped, ...withoutName } = SUBRACE;

    const result = validateEntry("subraces", withoutName);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues).toContainEqual(expect.objectContaining({ path: "name" }));
  });

  it("reports a nested field with its full dotted path", () => {
    const result = validateEntry("subraces", { ...SUBRACE, race: { index: "dwarf", name: "Dwarf" } });

    expect(!result.ok && result.issues.map((one) => one.path)).toContain("race.url");
  });

  it("indexes array elements in the path", () => {
    const result = validateEntry("subraces", {
      ...SUBRACE,
      ability_bonuses: [{ ability_score: SUBRACE.ability_bonuses[0].ability_score, bonus: "two" }],
    });

    expect(!result.ok && result.issues.map((one) => one.path)).toContain("ability_bonuses.0.bonus");
  });

  /**
   * The vendored schemas are `z.strictObject`, so an unknown key is a hard
   * failure rather than a silently-kept extra. Surfacing it is the point: a
   * typo'd key that validated would produce an entry missing the field the
   * author thought they had written.
   */
  it("rejects an unknown key rather than keeping it", () => {
    const result = validateEntry("subraces", { ...SUBRACE, speling: "wrong" });

    expect(result.ok).toBe(false);
  });

  it("reports the root itself when the value is not an object at all", () => {
    const result = validateEntry("subraces", "nope");

    expect(!result.ok && result.issues.map((one) => one.path)).toContain("(root)");
  });

  it("validates every authorable type through the same door", () => {
    const result = validateEntry("spells", { index: "x", name: "X" });

    // Not a passing entry — the point is that it validated rather than
    // throwing for want of a schema.
    expect(result.ok).toBe(false);
  });
});

describe("parseHomebrewJson", () => {
  it("parses valid JSON into a validated entry", () => {
    const result = parseHomebrewJson("subraces", JSON.stringify(SUBRACE));

    expect(result.ok).toBe(true);
  });

  /**
   * A syntax error is reported as an issue like any other, not thrown: the
   * JSON editor renders one error list, and a parse failure is the most
   * common thing in it.
   */
  it("reports a syntax error as an issue rather than throwing", () => {
    const result = parseHomebrewJson("subraces", "{ nope");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues).toHaveLength(1);
    expect(!result.ok && result.issues[0].path).toBe("(root)");
  });

  it("reports empty text as an issue rather than as valid JSON", () => {
    const result = parseHomebrewJson("subraces", "   ");

    expect(result.ok).toBe(false);
  });
});
