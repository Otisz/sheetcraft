import type { Modifier } from "@/features/dnd/db/schema";
import type { Target } from "@/features/dnd/derive";

/**
 * SRD features as MODIFIER RECORDS.
 *
 * All 407 entries in the vendored `features` catalog carry `desc` as English
 * prose and nothing structured, so nothing can read a number off them. This
 * module is the answer to the question CONTEXT.md § Base formula left open —
 * everything a feature contributes "arrives as a modifier record instead", and
 * this is who writes those records. See ADR-0004.
 *
 * The map is keyed by feature `index`, never by `name`: the barbarian's and the
 * monk's Unarmored Defense share a display name and differ in the ability they
 * add, so a name key would be wrong at the only feature the ticket names.
 *
 * It is **explicitly partial**. Most SRD features change no value this engine
 * derives, and those stay prose on the Features tab rather than having a target
 * invented for them — the closed target vocabulary is the boundary.
 */

/** A feature, narrowed to what a modifier needs: its index and how it reads. */
export type FeatureSource = {
  index: string;
  name: string;
};

/**
 * One record a feature contributes, before it knows which feature it belongs
 * to. The `id`, `source` and `label` are filled in from the feature, so the
 * table below says only what the rulebook says.
 */
type FeatureEffect = {
  target: Target;
  op: Modifier["op"];
  value: Modifier["value"];
};

/**
 * The map. Every entry is a transcription of one SRD sentence, and every entry
 * that is *absent* is a deliberate statement that this app does not compute the
 * thing that feature does.
 *
 * Rage is the clearest absence: advantage on STR checks, bonus melee damage and
 * resistance to three damage types are none of them a value `derive()` produces.
 * Fighting Style: Archery is another — `attack.<weaponId>.hit` needs a weapon id
 * that comes from the character's own equipment, so there is no record to write
 * at creation.
 */
const FEATURE_EFFECTS: Record<string, readonly FeatureEffect[]> = {
  /**
   * "your Armor Class equals 10 + your Dexterity modifier + your Constitution
   * modifier" — an `add` of the CON modifier, **not** a replacement base
   * formula: the base already yields `10 + dexMod` with no armor equipped.
   */
  "barbarian-unarmored-defense": [{ target: "ac", op: "add", value: { ref: "mod.con" } }],
  /** The monk's variant. Same sentence, WIS instead of CON — hence two entries. */
  "monk-unarmored-defense": [{ target: "ac", op: "add", value: { ref: "mod.wis" } }],

  /** "your speed increases by 10 feet while you aren't wearing heavy armor" */
  "fast-movement": [{ target: "speed", op: "add", value: 10 }],
  /** Unarmored Movement at 2nd level: +10 feet. */
  "unarmored-movement-1": [{ target: "speed", op: "add", value: 10 }],
  /**
   * Unarmored Movement at 9th level. The monk table reads 15 feet there, and
   * the level-2 record is still on the character — so this is the **+5
   * increment**, not the new total. Two `add`s that sum to the table's value is
   * how the trace reads on the sheet.
   */
  "unarmored-movement-2": [{ target: "speed", op: "add", value: 5 }],

  /**
   * "While you are wearing armor, you gain a +1 bonus to AC." One entry per
   * class, because the SRD gives the same style three different indexes.
   */
  "fighter-fighting-style-defense": [{ target: "ac", op: "add", value: 1 }],
  "fighting-style-defense": [{ target: "ac", op: "add", value: 1 }],
  "ranger-fighting-style-defense": [{ target: "ac", op: "add", value: 1 }],

  /** "you gain a +4 bonus to AC against all subsequent attacks made by that creature" */
  "defensive-tactics-multiattack-defense": [{ target: "ac", op: "add", value: 4 }],

  /**
   * Two sentences, two records. "your hit point maximum increases by 1 and
   * increases by 1 again whenever you gain a level in this class" is a
   * `{ref:'level'}` so it moves on level-up rather than going stale; "when you
   * aren't wearing armor, your AC equals 13 + your Dexterity modifier" is a +3
   * over the unarmored base of `10 + dexMod`.
   */
  "draconic-resilience": [
    { target: "maxHp", op: "add", value: { ref: "level" } },
    { target: "ac", op: "add", value: 3 },
  ],
};

/** The `feature:` namespace of one feature's records. */
function featureSource(index: string): string {
  return `feature:${index}`;
}

/** Whether the map has anything to say about this feature. */
export function hasFeatureModifiers(index: string): boolean {
  return Object.hasOwn(FEATURE_EFFECTS, index);
}

/**
 * The records a set of features contributes.
 *
 * Ids are derived from source and target rather than randomly generated, for
 * the reason `racialModifiers` does the same: the same feature must produce the
 * same record every time, or a re-derivation looks like a change and the merge
 * below has no stable key to match on.
 *
 * **Seeded disabled.** `enabled` is the only toggle mechanism — there is no
 * condition vocabulary and no expression language, because the player is the
 * condition evaluator (CONTEXT.md § Toggle). Unarmored Defense is conditional
 * on wearing no armor and the app does not evaluate that, so seeding it on
 * would state an AC the character may not have.
 */
export function featureModifiers(features: readonly FeatureSource[]): Modifier[] {
  const modifiers: Modifier[] = [];
  const taken = new Set<string>();

  for (const feature of features) {
    const effects = FEATURE_EFFECTS[feature.index];
    if (!effects) {
      continue;
    }

    const source = featureSource(feature.index);
    for (const effect of effects) {
      const id = `${source}:${effect.target}`;
      if (taken.has(id)) {
        continue;
      }
      taken.add(id);

      modifiers.push({
        id,
        source,
        target: effect.target,
        op: effect.op,
        value: effect.value,
        enabled: false,
        label: feature.name,
      });
    }
  }

  return modifiers;
}

/**
 * Re-derives a character's feature records against the features they currently
 * have — a **merge, not a replace**.
 *
 * Three rules, and each one is a bug avoided:
 *
 * - **The toggle survives.** A barbarian who levels to 3 does not find
 *   Unarmored Defense switched back off. The `enabled` flag is the player's,
 *   and re-derivation is not a player action.
 * - **Records for lost features go.** A class change takes its features with
 *   it, and a record whose feature the character no longer has is one nothing
 *   on the sheet can explain.
 * - **Everything else is untouched.** Racial bonuses, equipment, overrides and
 *   the player's own homebrew records all live in the same list and none of
 *   them is this function's business — which is also what makes a homebrew
 *   class shipping its own records work with nothing special-cased for SRD.
 */
export function syncFeatureModifiers(modifiers: readonly Modifier[], features: readonly FeatureSource[]): Modifier[] {
  const derived = featureModifiers(features);
  const enabledBefore = new Map(
    modifiers
      .filter((modifier) => modifier.source.startsWith("feature:"))
      .map((modifier) => [modifier.id, modifier.enabled]),
  );

  const kept = modifiers.filter((modifier) => !modifier.source.startsWith("feature:"));
  const rederived = derived.map((modifier) => ({
    ...modifier,
    enabled: enabledBefore.get(modifier.id) ?? modifier.enabled,
  }));

  return [...kept, ...rederived];
}
