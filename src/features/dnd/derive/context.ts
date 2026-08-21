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
import type { Abil } from "@/features/dnd/db/schema";

/**
 * One armor entry's AC block, exactly as the SRD stores it.
 *
 * `maxBonus` is optional rather than nullable because upstream **omits the key**
 * on unlimited-dex light armor rather than setting it to null — absent means
 * uncapped, and reading it as 0 would cost a rogue three points of AC.
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

/** The resolved catalog data one derivation needs. */
export type DeriveContext = {
  /** Every equipped armor entry, shields included. Order is irrelevant. */
  armor: EquippedArmor[];
  /**
   * The class's spellcasting ability, or `null` for a non-caster. Structural in
   * the SRD (`classes[].spellcasting.spellcasting_ability`), so it is read, not
   * hardcoded.
   */
  spellcastingAbility: Abil | null;
};

/** A context for a character with nothing equipped and no spellcasting. */
export const EMPTY_CONTEXT: DeriveContext = { armor: [], spellcastingAbility: null };
