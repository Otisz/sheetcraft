/**
 * The closed target vocabulary and the closed reference vocabulary.
 *
 * "Closed" is the load-bearing word: an unknown target is a validation error,
 * not a silently ignored record. A modifier that quietly does nothing is worse
 * than one that fails loudly — nobody gets a stack trace at the table, they
 * just take the wrong amount of damage. See CONTEXT.md § Modifier record.
 */
import { ABILITIES, type Abil } from "@/features/dnd/db/schema";

/** The 18 SRD skills, and the ability each keys off. PHB p.174. */
export const SKILLS = {
  acrobatics: "dex",
  "animal-handling": "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  "sleight-of-hand": "dex",
  stealth: "dex",
  survival: "wis",
} as const satisfies Record<string, Abil>;

export type Skill = keyof typeof SKILLS;

/**
 * Targets addressing exactly one value, with no variable part. Declared as an
 * object rather than an array so membership is a lookup, not a scan.
 */
export const SCALAR_TARGETS = {
  ac: true,
  maxHp: true,
  initiative: true,
  speed: true,
  proficiencyBonus: true,
  passivePerception: true,
  "spell.saveDc": true,
  "spell.attack": true,
} as const;

export type ScalarTarget = keyof typeof SCALAR_TARGETS;

/**
 * Every addressable target, as the union of its two halves. The split is by
 * whether the keys are knowable up front: the parameterised families —
 * `ability.<abil>`, `save.<abil>`, `skill.<skill>` — are enumerable and
 * therefore enumerated; `attack.<weaponId>.<hit|damage>` is not, because the
 * weapon id comes from the character's own equipment, so it is validated by
 * shape instead.
 *
 * Composed from the halves rather than listed alongside them, so the two can
 * never drift out of agreement.
 */
export type Target = EnumerableTarget | AttackTarget;

/**
 * A target naming one weapon's attack or damage roll — the one family whose
 * keys are not knowable without a character in hand, because the weapon id
 * comes from their own equipment.
 */
export type AttackTarget = `attack.${string}.hit` | `attack.${string}.damage`;

/**
 * Every target whose keys *are* knowable up front. The enumerable half of the
 * vocabulary, and the half `explain` answers for — see `DERIVED_TARGETS` for
 * the same set as values.
 */
export type EnumerableTarget = ScalarTarget | `ability.${Abil}` | `save.${Abil}` | `skill.${Skill}`;

/**
 * Every `EnumerableTarget`, as values. Built from the same three declarations
 * the type is built from, so a new skill or scalar target appears here without
 * anyone remembering to add it.
 */
export const DERIVED_TARGETS: readonly EnumerableTarget[] = [
  ...(Object.keys(SCALAR_TARGETS) as ScalarTarget[]),
  ...ABILITIES.flatMap((abil) => [`ability.${abil}`, `save.${abil}`] as const),
  ...(Object.keys(SKILLS) as Skill[]).map((skill) => `skill.${skill}` as const),
];

function isAbil(value: string): value is Abil {
  return (ABILITIES as readonly string[]).includes(value);
}

function isSkill(value: string): value is Skill {
  return Object.hasOwn(SKILLS, value);
}

/**
 * Whether a stored string names something derivable. The `attack.` family is
 * matched structurally — a dangling weapon id is a resolution miss the caller
 * renders, not a malformed target.
 */
export function isTarget(target: string): target is Target {
  if (Object.hasOwn(SCALAR_TARGETS, target)) {
    return true;
  }

  const abilityTarget = /^(?:ability|save)\.(.+)$/.exec(target);
  if (abilityTarget) {
    return isAbil(abilityTarget[1]);
  }

  const skillTarget = /^skill\.(.+)$/.exec(target);
  if (skillTarget) {
    return isSkill(skillTarget[1]);
  }

  return /^attack\.[^.]+\.(?:hit|damage)$/.test(target);
}

/**
 * The closed reference vocabulary — what a `{ref}` value may point at. Every
 * one is a value the engine derives before any reference is resolved, which is
 * what keeps resolution acyclic. See `resolveReference`.
 */
export type Reference = "level" | "proficiencyBonus" | `mod.${Abil}` | `score.${Abil}`;

export function isReference(ref: string): ref is Reference {
  if (ref === "level" || ref === "proficiencyBonus") {
    return true;
  }

  const abilityRef = /^(?:mod|score)\.(.+)$/.exec(ref);
  return abilityRef !== null && isAbil(abilityRef[1]);
}
