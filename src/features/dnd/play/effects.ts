/**
 * The effects row and the "Effects & conditions" drawer behind it.
 *
 * Two visual languages that must never merge:
 *
 * - **Effects** — modifier records the player toggles. They change numbers, so
 *   flipping one visibly moves AC, speed or a save.
 * - **Conditions** — SRD reminders that change nothing the app computes.
 *
 * Keeping the split here rather than in the component is what stops a future
 * edit rendering Prone the way it renders Unarmored Defense. If the two looked
 * alike, the row would imply arithmetic the app never did and a player might
 * trust a number that was never adjusted. See CONTEXT.md § Condition.
 *
 * Pure — the projection is testable without a browser, like the rest of `play/`.
 */
import type { CharacterRecord, Modifier } from "@/features/dnd/db/schema";
import { CONDITIONS, type Condition, findCondition } from "@/features/dnd/play/conditions";

/**
 * An override is a modifier record, but it is not an *effect*: it is a value
 * the player typed, surfaced as a marker on the value itself rather than as a
 * pill in the row. Rendering it as a togglable pill would offer a switch that
 * turning off does not clear. See CONTEXT.md § Override.
 */
const OVERRIDE_SOURCE = "override";

/**
 * The provenance namespaces whose records the player switches on and off.
 *
 * Stated positively, and that is the load-bearing part. Defining an effect as
 * "not an override" would sweep in every other namespace `schema.ts` declares —
 * and two of them must never appear as a switch on this screen:
 *
 * - **`race:`** — a racial ASI is character data. A pill offering to turn a
 *   Dwarf's +2 CON off is exactly the accidental edit that edit-by-separation
 *   exists to prevent.
 * - **`equip:`** — driven by equipping the item, not by a toggle. Two ways to
 *   unequip a shield is one way too many, and they would disagree.
 *
 * What is left is what a player genuinely flips mid-session: a class feature
 * (Rage, Unarmored Defense), a magic item they can stow, and their own
 * homebrew. See CONTEXT.md § Toggle.
 */
const TOGGLEABLE_SOURCES = ["feature:", "item:", "homebrew:"] as const;

function isEffect(modifier: Modifier): boolean {
  if (modifier.source === OVERRIDE_SOURCE) {
    return false;
  }
  return TOGGLEABLE_SOURCES.some((prefix) => modifier.source.startsWith(prefix));
}

/** One condition, and whether this character currently has it. */
export type ConditionState = Condition & { active: boolean };

/** What the drawer renders: the two groups it labels separately. */
export type EffectGroups = {
  /** Every toggleable modifier, enabled or not — the drawer switches them. */
  effects: Modifier[];
  /** All 15 SRD conditions, each marked active or not. */
  conditions: ConditionState[];
};

/**
 * The effects the row shows — active only. A row listing everything would be a
 * list of what is *available*, which is the drawer's job.
 */
export function activeEffects(character: CharacterRecord): Modifier[] {
  return character.modifiers.filter((modifier) => isEffect(modifier) && modifier.enabled);
}

/** The conditions the row shows — active only, for the same reason. */
export function activeConditions(character: CharacterRecord): Condition[] {
  return character.play.conditions
    .map((ref) => findCondition(ref))
    .filter((condition): condition is Condition => condition !== undefined);
}

/**
 * Flips one modifier's `enabled` flag, returning a new list. The player is the
 * condition evaluator — there is no expression language deciding this for
 * them. See CONTEXT.md § Toggle.
 */
export function toggleEffect(modifiers: Modifier[], id: string): Modifier[] {
  return modifiers.map((modifier) => (modifier.id === id ? { ...modifier, enabled: !modifier.enabled } : modifier));
}

/**
 * Adds or removes a condition, returning a new list. Idempotent in both
 * directions: adding one already present is not a duplicate pill.
 */
export function toggleCondition(
  refs: CharacterRecord["play"]["conditions"],
  index: string,
): CharacterRecord["play"]["conditions"] {
  const ref = `catalog:${index}` as const;
  return refs.includes(ref) ? refs.filter((one) => one !== ref) : [...refs, ref];
}

/**
 * Everything the drawer lists. Conditions come as the full 15 with an `active`
 * flag rather than as the character's few, because the drawer is where a
 * condition is *added* — a list of what you already have offers nothing to tap.
 */
export function effectGroups(character: CharacterRecord): EffectGroups {
  const active = new Set(character.play.conditions);

  return {
    effects: character.modifiers.filter(isEffect),
    conditions: CONDITIONS.map((condition) => ({
      ...condition,
      active: active.has(`catalog:${condition.index}`),
    })),
  };
}

/**
 * The overrides in force, keyed by the target each replaces. Drives the amber
 * "overridden" caption under a value and the tap that clears it.
 */
export function activeOverrides(character: CharacterRecord): Map<string, Modifier> {
  const overrides = new Map<string, Modifier>();

  for (const modifier of character.modifiers) {
    if (modifier.source === OVERRIDE_SOURCE && modifier.enabled) {
      // Last wins, matching resolution: a second override is the player
      // changing their mind. See CONTEXT.md § Override.
      overrides.set(modifier.target, modifier);
    }
  }

  return overrides;
}

/** Clearing an override means deleting the record — there is no other mechanism. */
export function clearOverride(modifiers: Modifier[], target: string): Modifier[] {
  return modifiers.filter((modifier) => !(modifier.source === OVERRIDE_SOURCE && modifier.target === target));
}

/**
 * How a target reads on the sheet. The stored targets are flat machine paths
 * (`ability.con`, `spell.saveDc`); showing one raw tells a player nothing about
 * what the effect does to them.
 *
 * Falls back to the raw target rather than to a blank: an unfamiliar path is
 * still information, and a nameless effect row is not.
 */
function targetLabel(target: string): string {
  const named: Record<string, string> = {
    ac: "AC",
    maxHp: "Max HP",
    initiative: "Initiative",
    speed: "Speed",
    proficiencyBonus: "Proficiency bonus",
    passivePerception: "Passive Perception",
    "spell.saveDc": "Spell save DC",
    "spell.attack": "Spell attack",
  };
  if (named[target]) {
    return named[target];
  }

  const [kind, rest] = [target.slice(0, target.indexOf(".")), target.slice(target.indexOf(".") + 1)];
  if (kind === "ability") {
    return rest.toUpperCase();
  }
  if (kind === "save") {
    return `${rest.toUpperCase()} save`;
  }
  if (kind === "skill") {
    // `animal-handling` → `Animal Handling`.
    return rest
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  return target;
}

/**
 * What a modifier does, in the row's own words — `AC +2`, `Speed set to 20`.
 * Read off the record rather than from a stored description, so it cannot
 * drift from the arithmetic actually applied.
 */
export function describeModifier(modifier: Modifier): string {
  const target = targetLabel(modifier.target);
  const value = typeof modifier.value === "number" ? modifier.value : `your ${modifier.value.ref}`;

  if (modifier.op === "add") {
    return typeof value === "number" && value < 0 ? `${target} ${value}` : `${target} +${value}`;
  }
  if (modifier.op === "set") {
    return `${target} set to ${value}`;
  }
  return modifier.op === "min" ? `${target} at least ${value}` : `${target} at most ${value}`;
}
