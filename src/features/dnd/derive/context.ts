/**
 * The catalog data the engine needs but cannot fetch.
 *
 * Derivation is pure — no Dexie (see `purity.test.ts`) — yet AC reads armor's
 * `{base, dex_bonus, max_bonus}` and the spell save DC reads the class's
 * spellcasting ability. Both are *structural* catalog data, so they arrive as
 * an argument the caller resolves through `resolveRef`, keeping ref parsing in
 * the one place CONTEXT.md says it lives.
 *
 * Everything a *feature* contributes arrives as a modifier record instead,
 * because SRD features are prose-only. See CONTEXT.md § Base formula.
 */
import type { Abil, SpellSlotLevel } from "@/features/dnd/db/schema";
import type { Skill } from "@/features/dnd/derive/targets";

/**
 * One armor entry's AC block, exactly as the SRD stores it.
 *
 * `maxBonus` is optional rather than nullable because upstream **omits the key**
 * on unlimited-dex light armor rather than setting it to null — absent means
 * uncapped, and reading it as 0 would cost a rogue four points of AC.
 */
export type ArmorClassData = {
  base: number;
  dexBonus: boolean;
  maxBonus?: number;
};

/**
 * A piece of equipped armor. `isShield` is carried rather than re-derived from
 * a category string so the engine never string-matches catalog prose.
 */
export type EquippedArmor = ArmorClassData & {
  /** The entry's `index`, for provenance: `equip:shield`. */
  index: string;
  name: string;
  /**
   * Whether this is a shield. The SRD stores the Shield as an armor entry whose
   * `base: 2` is **additive, not absolute** — so it contributes a modifier and
   * never becomes the base armor. Confirmed against the vendored data.
   */
  isShield: boolean;
};

/**
 * The base walking speed in feet, used when the context carries none.
 *
 * A fallback rather than a rule: every SRD race declares its own `speed`, so
 * this is only reached when the race ref does not resolve — the same
 * dangling-ref case the sheet renders as `⚠ unknown`. Falling back to base
 * beats throwing, and 30 is the SRD's most common value.
 */
export const DEFAULT_SPEED = 30;

/**
 * The hit die size used when the class ref does not resolve.
 *
 * Like `DEFAULT_SPEED`, a fallback rather than a rule: every SRD class declares
 * its own `hit_die`, so this is reached only for a dangling ref. A d8 is the
 * SRD's most common value.
 */
export const DEFAULT_HIT_DIE = 8;

/**
 * A weapon the character can attack with, already resolved from the equipment
 * table.
 *
 * `finesse` and `ranged` are carried as booleans rather than as the SRD's
 * `properties` array and `weapon_range` string, for the same reason
 * `EquippedArmor` carries `isShield`: the engine must never string-match
 * catalog prose. The caller reads the SRD's shape; the engine reads meaning.
 */
export type Weapon = {
  /** The entry's `index` — also the weapon id in `attack.<id>.hit`. */
  index: string;
  name: string;
  /** The damage dice as the SRD spells them: `1d8`. Never parsed — Sheetcraft does not roll. */
  damageDice: string;
  /** The SRD's own damage type name, for display: `Slashing`. */
  damageType: string;
  /** PHB p.195 — the attack may use DEX instead of STR, whichever is better. */
  finesse: boolean;
  /** A ranged weapon keys off DEX (PHB p.194). */
  ranged: boolean;
  /** Whether the character is proficient with it — the bonus applies to the attack roll only. */
  proficient: boolean;
};

/**
 * The slot maxima for one class and level, as `{ [slot level]: count }`.
 *
 * Sparse on purpose: the SRD stores explicit zeroes for the levels a caster has
 * no slots in, and a row reading "0 / 0" is noise on a phone. The caller drops
 * them, so a level present here is a level the character genuinely has.
 */
export type SlotsByLevel = Partial<Record<SpellSlotLevel, number>>;

/** The resolved catalog data one derivation needs. */
export type DeriveContext = {
  /** Every equipped armor entry, shields included. Order is irrelevant. */
  armor: EquippedArmor[];
  /**
   * The race's base walking speed in feet — structural SRD data
   * (`races[].speed`), so it is read rather than hardcoded. Optional because a
   * dangling race ref has none to read; `DEFAULT_SPEED` covers that case.
   */
  speed?: number;
  /**
   * The skills the character is proficient in, already resolved from the
   * `catalog:` refs on the record. Resolved by the caller rather than matched
   * here so ref parsing stays in `resolveRef` — the engine never encodes the
   * ref grammar a second time.
   */
  skillProficiencies: Skill[];
  /** The skills the character has expertise in, resolved the same way. */
  expertise: Skill[];
  /**
   * The class's spellcasting ability, or `null` for a non-caster. Structural in
   * the SRD (`classes[].spellcasting.spellcasting_ability`), so it is read, not
   * hardcoded.
   */
  spellcastingAbility: Abil | null;
  /**
   * The class's hit die size — structural SRD data (`classes[].hit_die`), so it
   * is read rather than hardcoded. Optional because a dangling class ref has
   * none to read; `DEFAULT_HIT_DIE` covers that case.
   */
  hitDie?: number;
  /**
   * The weapons the character can attack with, in the order they are carried.
   * Empty for a character carrying none, which is the honest rendering — an
   * unarmed strike is a feature, not equipment, and would arrive as a modifier.
   */
  weapons?: Weapon[];
  /**
   * The slot maxima for this class and level, from the `levels` catalog. Absent
   * for a non-caster, which is different from present-and-empty only in intent;
   * both derive to no slot rows.
   */
  slotsByLevel?: SlotsByLevel;
  /** How many cantrips the class knows at this level. Cast at will, so never a slot row. */
  cantripsKnown?: number;
};

/**
 * A context for a character with nothing equipped, no skill proficiencies and
 * no spellcasting.
 *
 * Exported for tests and for callers building one up field by field — **not** a
 * default. `derive` takes its context as a required argument, because a context
 * that defaulted to this would silently derive AC 10 for an armored character.
 */
export const EMPTY_CONTEXT: DeriveContext = {
  armor: [],
  speed: DEFAULT_SPEED,
  skillProficiencies: [],
  expertise: [],
  spellcastingAbility: null,
};
