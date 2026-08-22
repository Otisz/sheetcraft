/**
 * The six tabs, and the map that gives every field in the character record a
 * home.
 *
 * The map is the load-bearing part. "Every field in the character record is
 * reachable somewhere in the UI" is what the tab set was designed around — the
 * set came from auditing the record and finding eight homeless fields, currency
 * among them, which was missing from the schema entirely. See #164.
 *
 * A map nothing checks would drift the moment a field is added, so
 * `tabs.test.ts` reads the record's own keys and asserts each one is placed.
 * That is why this is a module and not a comment.
 *
 * Pure — no React, no Dexie, like the rest of `play/`.
 */
import type { Currency } from "@/features/dnd/db/schema";

/** One tab in the bar. */
export type SheetTab = {
  id: SheetTabId;
  label: string;
  /** What the tab holds, for the tab panel's accessible name. */
  description: string;
};

export type SheetTabId = "skills" | "combat" | "spells" | "features" | "inventory" | "bio";

/**
 * The six, in the order the bar shows them: the two rolled from most often
 * first, then spells, then the three consulted rather than rolled.
 */
export const SHEET_TABS: readonly SheetTab[] = [
  {
    id: "skills",
    label: "Skills",
    // Saving throws head this tab rather than sitting on the main scroll: they
    // are rolled as often as skills, and grouping them costs no space above
    // the fold.
    description: "Saving throws, passive Perception and the eighteen skills",
  },
  { id: "combat", label: "Combat", description: "Hit dice, inspiration and attacks" },
  { id: "spells", label: "Spells", description: "Spell slots, and the spells known and prepared" },
  { id: "features", label: "Features", description: "Class and race features" },
  { id: "inventory", label: "Inventory", description: "Currency and carried items" },
  { id: "bio", label: "Bio", description: "Proficiencies, background, alignment and notes" },
];

/**
 * Where each field lives, and **the component that actually renders it**.
 *
 * The second half is the load-bearing one, and it was learned the hard way: an
 * earlier version of this map recorded only the tab, and five fields —
 * `classRef`, `subclassRef`, `raceRef`, `subraceRef`, `hpRolls` — sat in it
 * with no pixels behind them. The coverage test passed on the map entry alone,
 * which is precisely the drift the map claims to prevent. Naming the renderer
 * makes the claim checkable: a home whose `renderedBy` is empty is a field the
 * player cannot reach, and the test says so.
 *
 * `header` means the always-visible part of the sheet above the tabs — identity
 * and hit points, which must never be a tap away mid-combat.
 *
 * Bookkeeping fields (`id`, `schemaVersion`, `createdAt`) are placed on `bio`
 * rather than excluded: a record field with no home is the failure this map
 * exists to catch, and "shown as metadata at the foot of Bio" is a home.
 */
export const CHARACTER_FIELD_HOMES = {
  // identity — the header, always visible
  name: { tab: "header", renderedBy: "Identity" },
  level: { tab: "header", renderedBy: "Identity" },
  classRef: { tab: "header", renderedBy: "Identity" },
  subclassRef: { tab: "header", renderedBy: "Identity" },
  raceRef: { tab: "header", renderedBy: "Identity" },
  subraceRef: { tab: "header", renderedBy: "Identity" },
  abilities: { tab: "header", renderedBy: "Abilities" },
  modifiers: { tab: "header", renderedBy: "EffectsRow" },

  // bookkeeping — the foot of Bio
  id: { tab: "bio", renderedBy: "Bookkeeping" },
  schemaVersion: { tab: "bio", renderedBy: "Bookkeeping" },
  createdAt: { tab: "bio", renderedBy: "Bookkeeping" },
  updatedAt: { tab: "bio", renderedBy: "Bookkeeping" },
  backgroundRef: { tab: "bio", renderedBy: "Background" },
  alignment: { tab: "bio", renderedBy: "Background" },

  // the tabs
  hpRolls: { tab: "combat", renderedBy: "HitPointRolls" },
  proficiencies: { tab: "bio", renderedBy: "Proficiencies" },
  equipment: { tab: "inventory", renderedBy: "Items" },
  spells: { tab: "spells", renderedBy: "SpellList" },
  play: { tab: "header", renderedBy: "HpSection" },

  "proficiencies.skills": { tab: "skills", renderedBy: "SkillList" },
  "proficiencies.expertise": { tab: "skills", renderedBy: "SkillList" },
  "proficiencies.saves": { tab: "skills", renderedBy: "SavingThrows" },
  "proficiencies.armor": { tab: "bio", renderedBy: "Proficiencies" },
  "proficiencies.weapons": { tab: "bio", renderedBy: "Proficiencies" },
  "proficiencies.tools": { tab: "bio", renderedBy: "Proficiencies" },
  "proficiencies.languages": { tab: "bio", renderedBy: "Proficiencies" },

  "play.currentHp": { tab: "header", renderedBy: "HpSection" },
  "play.tempHp": { tab: "header", renderedBy: "HpSection" },
  "play.deathSaves": { tab: "header", renderedBy: "HpSection" },
  "play.conditions": { tab: "header", renderedBy: "EffectsRow" },
  "play.hitDiceSpent": { tab: "combat", renderedBy: "HitDiceSection" },
  "play.inspiration": { tab: "combat", renderedBy: "InspirationSection" },
  "play.slotsExpended": { tab: "spells", renderedBy: "Slots" },
  "play.currency": { tab: "inventory", renderedBy: "CurrencySection" },
  "play.notes": { tab: "bio", renderedBy: "Notes" },
} as const satisfies Record<string, FieldHome>;

/**
 * Where one field lives and what draws it. `undefined` means the map has never
 * heard of the field — a field with no home, and a test failure rather than a
 * runtime one.
 */
export type FieldHome = {
  tab: SheetTabId | "header";
  /**
   * The component function that renders it. A name rather than a reference so
   * this module stays free of React and testable as pure data — the test
   * asserts it is non-empty, and a reviewer can grep it.
   */
  renderedBy: string;
};

export function homeForField(field: string): FieldHome | undefined {
  return Object.hasOwn(CHARACTER_FIELD_HOMES, field)
    ? CHARACTER_FIELD_HOMES[field as keyof typeof CHARACTER_FIELD_HOMES]
    : undefined;
}

/** Which tab a field lives on. */
export function tabForField(field: string): SheetTabId | "header" | undefined {
  return homeForField(field)?.tab;
}

/** One coin's row on the Inventory tab. */
export type CurrencyRow = {
  unit: keyof Currency;
  label: string;
  amount: number;
};

/** The coins in full, so a row reads "Gold" rather than "gp". */
const COIN_LABELS: Record<keyof Currency, string> = {
  cp: "Copper",
  sp: "Silver",
  ep: "Electrum",
  gp: "Gold",
  pp: "Platinum",
};

/**
 * The five coins, ascending in value.
 *
 * The order comes from the record's own key order rather than from a list
 * here — CONTEXT.md § Currency declares the keys cp → pp precisely so the sheet
 * can render from `Object.entries`, and restating the order would be a second
 * place for it to be wrong.
 *
 * A coin the character has none of still gets a row: a missing one would read
 * as "this character cannot hold platinum", and the row is where the first one
 * is added.
 */
export function currencyRows(currency: Currency): CurrencyRow[] {
  return (Object.keys(currency) as (keyof Currency)[]).map((unit) => ({
    unit,
    label: COIN_LABELS[unit],
    amount: currency[unit],
  }));
}
