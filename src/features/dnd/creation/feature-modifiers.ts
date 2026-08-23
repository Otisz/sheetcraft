import { modifierId } from "@/features/dnd/db/modifier-id";
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
  /**
   * "your speed increases by 10 feet while you are not wearing armor or
   * wielding a shield" — the 2nd-level row, and the only Unarmored Movement
   * record this map writes.
   *
   * **`unarmored-movement-2` is deliberately absent**, though the SRD ships it
   * as a feature row. It is the 9th-level entry, and what it grants is the
   * ability to move along vertical surfaces and across liquids — not a speed
   * bonus. The monk's speed scaling lives in the `Levels` table
   * (`class_specific.unarmored_movement`: 10 at 2, 15 at **6**, 20 at 10, 25 at
   * 14, 30 at 18) and the SRD ships no feature row for any step after the
   * first. Reading a record off the 9th-level row would put +5 on the sheet
   * three levels after the rules grant it and leave a level-6 monk 5 feet
   * short — a number this map would have invented.
   *
   * Deriving the rest means reading the `Levels` table, which is a base-formula
   * change rather than a modifier record, and out of scope here.
   */
  "unarmored-movement-1": [{ target: "speed", op: "add", value: 10 }],

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

/**
 * The `feature:` provenance namespace — the one place this module spells it.
 *
 * `effects.ts` names the same prefix in its positive list of toggleable
 * sources, and that repetition is deliberate: the list there is a statement
 * about which namespaces get a switch, not a derivation from this one.
 */
const FEATURE_NAMESPACE = "feature:";

/** The `feature:` namespace of one feature's records. */
function featureSource(index: string): string {
  return `${FEATURE_NAMESPACE}${index}`;
}

/** Whether a record was written by this module, and is therefore ours to re-derive. */
function isFeatureRecord(modifier: Modifier): boolean {
  return modifier.source.startsWith(FEATURE_NAMESPACE);
}

/**
 * Whether the map has anything to say about this feature.
 *
 * Not on the feature's public surface — nothing in the app asks this question,
 * because `featureModifiers` already answers it by returning nothing. It exists
 * for the coverage test, which checks every key against the vendored catalog
 * without the map itself having to be exported.
 */
export function hasFeatureModifiers(index: string): boolean {
  return Object.hasOwn(FEATURE_EFFECTS, index);
}

/**
 * The records a set of features contributes.
 *
 * Ids come from `modifierId`, the same rule the racial bonuses use — see there
 * for why they are derived rather than generated.
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
      const id = modifierId(source, effect.target);
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
  const enabledBefore = new Map(modifiers.filter(isFeatureRecord).map((modifier) => [modifier.id, modifier.enabled]));

  const kept = modifiers.filter((modifier) => !isFeatureRecord(modifier));
  const rederived = derived.map((modifier) => ({
    ...modifier,
    enabled: enabledBefore.get(modifier.id) ?? modifier.enabled,
  }));

  return [...kept, ...rederived];
}
