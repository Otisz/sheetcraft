import { ABILITIES, type Abil, type Modifier, type Ref } from "@/features/dnd/db/schema";

/**
 * Racial ability bonuses as MODIFIER RECORDS.
 *
 * They are never baked into the stored scores. Two things fall out of that:
 * a race change swaps a set of records rather than trying to unpick arithmetic
 * from a number, and the sheet can say *why* CON is 16. See CONTEXT.md
 * § Input vs derived.
 *
 * The records target `ability.<abil>` with `op: "add"`, which is exactly what
 * the derivation engine already resolves — nothing here is special-cased
 * downstream.
 */

/** One `ability_bonuses` entry, narrowed to what a modifier needs. */
type AbilityBonus = {
  ability_score?: { index?: unknown };
  bonus?: unknown;
};

/**
 * A race or subrace entry, narrowed to the bonus fields. Structural rather
 * than the full vendored schema so a homebrew race — same schema, but reaching
 * us as a stored `CatalogEntry` — needs no separate path.
 */
export type RacialSource = {
  ref: Ref | string;
  name: string;
  ability_bonuses?: AbilityBonus[];
  ability_bonus_options?: unknown;
};

/** What a race with floating bonuses asks the form for. */
export type FloatingChoice = {
  /** How many abilities to pick. Half-Elf asks for 2. */
  choose: number;
  /** The bonus each pick is worth. */
  bonus: number;
  /** The abilities that may be picked — Half-Elf excludes its own fixed CHA. */
  from: Abil[];
};

/**
 * A picker option as a bonus source. One conversion, named — the race and the
 * subrace both need it, and spreading `{ ref, name, ...entry }` at each call
 * site is the same shape written twice.
 */
export function toRacialSource(
  option: { ref: Ref; name: string; entry: Record<string, unknown> } | null | undefined,
): RacialSource | null {
  return option ? { ...option.entry, ref: option.ref, name: option.name } : null;
}

export type RacialModifierInput = {
  race: RacialSource | null;
  subrace?: RacialSource | null;
  /** The player's floating picks, in pick order. Ignored when the race asks for none. */
  floating?: Abil[];
};

function isAbil(value: unknown): value is Abil {
  return typeof value === "string" && (ABILITIES as readonly string[]).includes(value);
}

/**
 * Ids are derived from source and target rather than randomly generated, so
 * the same race produces the same records every time. A random id would make
 * every re-render look like a change to the modifier list and would make these
 * records untestable by equality.
 */
function modifierId(source: string, target: string): string {
  return `${source}:${target}`;
}

function bonusModifier(entry: RacialSource, abil: Abil, bonus: number): Modifier {
  const source = `race:${entry.ref}`;
  return {
    id: modifierId(source, `ability.${abil}`),
    source,
    target: `ability.${abil}`,
    op: "add",
    value: bonus,
    enabled: true,
    label: `${entry.name} +${bonus} ${abil.toUpperCase()}`,
  };
}

/** The fixed `ability_bonuses` of one entry, skipping anything malformed. */
function fixedModifiers(entry: RacialSource | null | undefined): Modifier[] {
  if (!entry?.ability_bonuses) {
    return [];
  }

  const modifiers: Modifier[] = [];
  for (const bonus of entry.ability_bonuses) {
    const abil = bonus.ability_score?.index;
    if (!isAbil(abil) || typeof bonus.bonus !== "number") {
      continue;
    }
    modifiers.push(bonusModifier(entry, abil, bonus.bonus));
  }
  return modifiers;
}

/**
 * What a race's `ability_bonus_options` asks for, or `null` when it asks
 * nothing. In the 2014 SRD only Half-Elf has one: two +1s from the five
 * abilities its fixed +2 CHA does not already cover.
 *
 * Read from the data rather than hardcoded, so a homebrew race with a floating
 * bonus prompts correctly with no change here.
 */
export function floatingBonusChoices(race: RacialSource | null): FloatingChoice | null {
  const options = race?.ability_bonus_options as { choose?: unknown; from?: { options?: unknown } } | undefined;

  if (!options || typeof options.choose !== "number" || options.choose <= 0) {
    return null;
  }

  const raw = options.from?.options;
  if (!Array.isArray(raw)) {
    return null;
  }

  const from: Abil[] = [];
  let bonus = 1;
  for (const option of raw) {
    const entry = option as { ability_score?: { index?: unknown }; bonus?: unknown };
    const abil = entry.ability_score?.index;
    if (!isAbil(abil)) {
      continue;
    }
    if (typeof entry.bonus === "number") {
      bonus = entry.bonus;
    }
    from.push(abil);
  }

  return from.length === 0 ? null : { choose: options.choose, bonus, from };
}

/**
 * Every racial modifier a character carries: the race's fixed bonuses, the
 * subrace's, then the floating picks — in that order, which is the order the
 * sheet's provenance list reads best in.
 *
 * A floating pick the race never asked for is dropped rather than applied: the
 * picks outlive a race change in the form (so a mis-tap does not lose them),
 * and only the current race decides whether they count.
 */
export function racialModifiers({ race, subrace, floating = [] }: RacialModifierInput): Modifier[] {
  if (!race) {
    return [];
  }

  const modifiers = [...fixedModifiers(race), ...fixedModifiers(subrace)];

  const choice = floatingBonusChoices(race);
  if (choice) {
    for (const abil of floating.slice(0, choice.choose)) {
      if (choice.from.includes(abil)) {
        modifiers.push(bonusModifier(race, abil, choice.bonus));
      }
    }
  }

  return modifiers;
}
