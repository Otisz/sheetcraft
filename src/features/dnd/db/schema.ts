/**
 * The shapes stored in Dexie. Types only — no runtime Dexie access lives here,
 * so this module is safe to import from anywhere, server included.
 *
 * The record stores INPUTS ONLY. AC, max HP, proficiency bonus, ability
 * modifiers, save/skill modifiers, spell save DC, initiative and slot maxima
 * are derived on every read and never stored. See CONTEXT.md § Input vs derived.
 */

/** The six ability score keys, in sheet order. */
export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

export type Abil = (typeof ABILITIES)[number];

/**
 * A catalog reference — `catalog:human`, `homebrew:azureborn`. The prefix
 * selects the table, the suffix is the entry's `index`.
 *
 * Parsed in exactly one place: `resolveRef`. Nothing else splits the string.
 */
export type Ref = `catalog:${string}` | `homebrew:${string}`;

/** A typed adjustment to one derivable value. See CONTEXT.md § Modifier record. */
export type Modifier = {
  id: string;
  /** Namespaced provenance: `feature:*`, `equip:*`, `item:*`, `race:*`, `homebrew:*`, `override`. */
  source: string;
  /** A flat path from the closed target vocabulary (`ac`, `skill.stealth`, …). */
  target: string;
  op: "add" | "set" | "min" | "max";
  /** A number, or a reference resolved at derivation time so it never goes stale. */
  value: number | { ref: string };
  /** The player-flipped toggle. Stored, never indexed — booleans are not indexable. */
  enabled: boolean;
  label: string;
};

export type SpellSlotLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * The nine slot levels, ascending — the order a caster reads them in.
 *
 * Beside the type rather than in either module that iterates it: the resolver
 * that reads the SRD's `spell_slots_level_N` keys and the engine that emits the
 * rows must agree on this set exactly, and two copies are two things to keep in
 * step.
 */
export const SPELL_SLOT_LEVELS: readonly SpellSlotLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export type DeathSaveCount = 0 | 1 | 2 | 3;

/**
 * Money, and money only, in ascending value. The sheet renders from
 * `Object.entries`, so key order here is display order.
 */
export type Currency = {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
};

/** Play state — changes every session, lives in the character record by design. */
export type PlayState = {
  currentHp: number;
  tempHp: number;
  hitDiceSpent: number;
  deathSaves: { successes: DeathSaveCount; failures: DeathSaveCount };
  slotsExpended: Record<SpellSlotLevel, number>;
  currency: Currency;
  conditions: Ref[];
  inspiration: boolean;
  notes: string;
};

export type CharacterProficiencies = {
  skills: Ref[];
  expertise: Ref[];
  saves: Abil[];
  armor: Ref[];
  weapons: Ref[];
  tools: Ref[];
  languages: Ref[];
};

export type CharacterEquipmentEntry = {
  itemRef: Ref;
  quantity: number;
  equipped: boolean;
};

export type CharacterRecord = {
  id: string;
  /**
   * Deliberately redundant with Dexie's own version: it travels with an
   * exported backup file, where Dexie's version number does not.
   */
  schemaVersion: 1;
  name: string;
  createdAt: Date;
  updatedAt: Date;

  // character data — inputs only
  level: number;
  classRef: Ref;
  subclassRef: Ref | null;
  raceRef: Ref;
  subraceRef: Ref | null;
  backgroundRef: Ref | null;
  alignment: string | null;

  /** The six BASE scores as entered. Racial bonuses arrive as modifier records. */
  abilities: Record<Abil, number>;
  /**
   * One hit-die roll per level. A total would go stale when CON changes:
   * `maxHp = sum(hpRolls) + conMod * level`.
   */
  hpRolls: number[];
  proficiencies: CharacterProficiencies;
  equipment: CharacterEquipmentEntry[];
  spells: { known: Ref[]; prepared: Ref[] };
  modifiers: Modifier[];

  play: PlayState;
};

/** A `dnd_meta` row. Sync bookkeeping, keyed by `key`. */
export type MetaRecord = {
  key: string;
  value: unknown;
};

/** The minimum every catalog and homebrew entry carries: its `index` key. */
export type CatalogEntry = {
  index: string;
  [key: string]: unknown;
};

/** A homebrew entry — same schema as its catalog counterpart, plus edit bookkeeping. */
export type HomebrewEntry = CatalogEntry & {
  updatedAt: Date;
};
