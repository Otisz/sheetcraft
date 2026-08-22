/**
 * The 15 SRD conditions, as REMINDERS ONLY.
 *
 * They carry no modifier record, because their real effects are
 * advantage/disadvantage and movement — which Sheetcraft deliberately does not
 * compute. The sheet renders them visually distinct from effects so the row
 * never implies arithmetic the app did not do. See CONTEXT.md § Condition.
 *
 * Declared here rather than vendored: there is no `conditions` catalog in the
 * upstream pin, and there is no `conditions` table for a ref to resolve
 * against. The set is fixed at 15 and has not moved since 2014, so a source
 * literal is honest where a lookup would be theatre.
 *
 * The descriptions are abridged to the line a player needs mid-combat, not
 * transcribed in full — the app is a reminder, not a rulebook.
 */
import { refIndex, refSource } from "@/features/dnd/db/resolve-ref";
import type { Ref } from "@/features/dnd/db/schema";

export type Condition = {
  /** The entry key, matching the SRD's own index convention. */
  index: string;
  name: string;
  /** The one line worth reading at the table. */
  description: string;
};

/** Alphabetical, which is the order the drawer lists them in. PHB Appendix A. */
export const CONDITIONS: readonly Condition[] = [
  {
    index: "blinded",
    name: "Blinded",
    description: "Can't see; auto-fails sight checks. Attacks against you have advantage, yours have disadvantage.",
  },
  {
    index: "charmed",
    name: "Charmed",
    description: "Can't attack the charmer. The charmer has advantage on social checks with you.",
  },
  {
    index: "deafened",
    name: "Deafened",
    description: "Can't hear; auto-fails hearing checks.",
  },
  {
    index: "exhaustion",
    name: "Exhaustion",
    description: "Six levels, each worse than the last — from disadvantage on checks to death at level 6.",
  },
  {
    index: "frightened",
    name: "Frightened",
    description: "Disadvantage while the source is in sight; can't willingly move closer to it.",
  },
  {
    index: "grappled",
    name: "Grappled",
    description: "Speed is 0. Ends if the grappler is incapacitated or you are moved away.",
  },
  {
    index: "incapacitated",
    name: "Incapacitated",
    description: "Can't take actions or reactions.",
  },
  {
    index: "invisible",
    name: "Invisible",
    description: "Attacks against you have disadvantage, yours have advantage.",
  },
  {
    index: "paralyzed",
    name: "Paralyzed",
    description: "Incapacitated, can't move or speak, auto-fail STR and DEX saves. Hits within 5 ft. are critical.",
  },
  {
    index: "petrified",
    name: "Petrified",
    description: "Turned to stone: incapacitated, unaware, resistant to all damage, immune to poison and disease.",
  },
  {
    index: "poisoned",
    name: "Poisoned",
    description: "Disadvantage on attack rolls and ability checks.",
  },
  {
    index: "prone",
    name: "Prone",
    description: "Disadvantage on attacks. Attacks within 5 ft. have advantage, ranged ones have disadvantage.",
  },
  {
    index: "restrained",
    name: "Restrained",
    description: "Speed is 0. Attacks against you have advantage, yours have disadvantage; disadvantage on DEX saves.",
  },
  {
    index: "stunned",
    name: "Stunned",
    description: "Incapacitated, can barely speak, auto-fail STR and DEX saves. Attacks against you have advantage.",
  },
  {
    index: "unconscious",
    name: "Unconscious",
    description: "Incapacitated, prone, drop everything. Hits within 5 ft. are critical.",
  },
] as const;

const BY_INDEX = new Map(CONDITIONS.map((condition) => [condition.index, condition]));

/**
 * The ref a condition is stored as on `play.conditions`.
 *
 * Prefixed `catalog:` because that is what the stored `Ref` type means — SRD
 * content rather than user-authored — even though these resolve from this
 * module rather than from Dexie. A homebrew condition would be a
 * `Toggle`-driven effect instead, since anything that changes a number is an
 * effect by definition.
 */
export function conditionRef(index: string): Ref {
  return `catalog:${index}`;
}

/**
 * The condition a ref names, or `undefined` if it names something else.
 *
 * Splits the ref through `refIndex`/`refSource` rather than by hand: those are
 * `resolveRef`'s own accessors, and a second copy of the grammar here is
 * exactly what CONTEXT.md § Catalog reference forbids.
 */
export function findCondition(ref: Ref | string): Condition | undefined {
  if (refSource(ref) !== "catalog") {
    return undefined;
  }

  const index = refIndex(ref);
  return index === null ? undefined : BY_INDEX.get(index);
}

export function isConditionRef(ref: Ref | string): boolean {
  return findCondition(ref) !== undefined;
}
