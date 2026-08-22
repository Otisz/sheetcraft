/**
 * The tab model — which tab each part of the record lives on, and the
 * projections the tabs render.
 *
 * The coverage case is the reason this is a tested module rather than a
 * component detail: "every field in the character record has a home" is the
 * acceptance criterion the six tabs exist to satisfy, and a criterion nothing
 * checks is one a later field silently breaks. See #164.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeCharacter } from "@/features/dnd/derive/fixtures";
import { CHARACTER_FIELD_HOMES, currencyRows, homeForField, SHEET_TABS, tabForField } from "@/features/dnd/play/tabs";

/** The components live beside this test; `import.meta.url` keeps that literal. */
const PLAY_DIR = dirname(fileURLToPath(import.meta.url));

describe("the six tabs", () => {
  it("has exactly six", () => {
    expect(SHEET_TABS).toHaveLength(6);
  });

  it("lists them in the order the sheet shows them", () => {
    expect(SHEET_TABS.map((tab) => tab.id)).toEqual(["skills", "combat", "spells", "features", "inventory", "bio"]);
  });

  it("gives every tab a label", () => {
    expect(SHEET_TABS.every((tab) => tab.label.length > 0)).toBe(true);
  });
});

describe("field coverage", () => {
  /**
   * The record's own keys, read off a real record rather than restated — a
   * hand-written list would be the very drift this guards against.
   */
  const character = makeCharacter();
  const recordFields = Object.keys(character);
  const playFields = Object.keys(character.play).map((field) => `play.${field}`);
  const proficiencyFields = Object.keys(character.proficiencies).map((field) => `proficiencies.${field}`);

  it.each([...recordFields, ...playFields, ...proficiencyFields])("%s has a home", (field) => {
    expect(tabForField(field)).not.toBeUndefined();
  });

  /**
   * The components the sheet actually defines, read off the source rather than
   * listed here. Reading the files is the whole point: a `renderedBy` naming a
   * component nobody wrote would otherwise satisfy the coverage claim exactly
   * as a bare tab name did, which is the bug this test was rewritten to catch.
   */
  const definedComponents = new Set(
    readdirSync(PLAY_DIR)
      .filter((file) => file.endsWith(".tsx"))
      .flatMap((file) => {
        const source = readFileSync(join(PLAY_DIR, file), "utf8");
        return [...source.matchAll(/(?:export\s+)?function\s+([A-Z]\w*)/g)].map((match) => match[1]);
      }),
  );

  it.each([...recordFields, ...playFields, ...proficiencyFields])("%s is rendered by something", (field) => {
    const home = homeForField(field);

    expect(home?.renderedBy).toBeTruthy();
    // A home is a promise that the player can see the field. Naming the
    // component that keeps the promise is what makes the promise checkable.
    expect(definedComponents).toContain(home?.renderedBy);
  });

  it("claims no field the record does not have", () => {
    const actual = new Set([...recordFields, ...playFields, ...proficiencyFields]);

    expect(Object.keys(CHARACTER_FIELD_HOMES).filter((field) => !actual.has(field))).toEqual([]);
  });

  it("names a real tab for every field it places", () => {
    const tabIds = new Set<string>(SHEET_TABS.map((tab) => tab.id));

    expect(
      Object.values(CHARACTER_FIELD_HOMES)
        .map((home) => home.tab)
        .filter((tab) => tab !== "header" && !tabIds.has(tab)),
    ).toEqual([]);
  });

  it("puts saving throws on the Skills tab rather than on the main scroll", () => {
    // They are rolled as often as skills, and grouping them costs no space
    // above the fold. See #164.
    expect(tabForField("proficiencies.saves")).toBe("skills");
  });

  it("puts currency on the Inventory tab", () => {
    expect(tabForField("play.currency")).toBe("inventory");
  });

  it("keeps hit points on the header, where play mode already shows them", () => {
    // Not a tab: the HP row is the one control that must never be a tap away.
    expect(tabForField("play.currentHp")).toBe("header");
  });
});

describe("currency rows", () => {
  it("reads cp → pp, ascending in value", () => {
    // The sheet renders from the record's own key order, so this asserts the
    // schema's ordering as much as the projection's. See CONTEXT.md § Currency.
    expect(currencyRows(makeCharacter().play.currency).map((row) => row.unit)).toEqual(["cp", "sp", "ep", "gp", "pp"]);
  });

  it("carries each amount", () => {
    const character = makeCharacter();
    const currency = { ...character.play.currency, gp: 42 };

    expect(currencyRows(currency).find((row) => row.unit === "gp")?.amount).toBe(42);
  });

  it("shows a coin with none of it rather than hiding the row", () => {
    // A missing row would read as "this character cannot hold platinum",
    // and the row is where you *add* the first one.
    expect(currencyRows(makeCharacter().play.currency)).toHaveLength(5);
  });

  it("labels each coin in full", () => {
    expect(currencyRows(makeCharacter().play.currency).map((row) => row.label)).toEqual([
      "Copper",
      "Silver",
      "Electrum",
      "Gold",
      "Platinum",
    ]);
  });
});
