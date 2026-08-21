/**
 * The derivation engine: `(character) → derived values + provenance`.
 *
 * Pure by construction — no Dexie, no React, no network, no clock. Everything
 * it needs arrives as an argument, which is what makes the rules-correctness
 * surface testable against transcribed rulebook values rather than against
 * itself. See ADR-0002.
 *
 * This module covers abilities, proficiency bonus and max HP. AC, skills and
 * saves land on the same seam in #157: they read `DerivedCore` and add their
 * own targets, so nothing here needs to change to accommodate them.
 */
import { ABILITIES, type Abil, type CharacterRecord, type Modifier } from "@/features/dnd/db/schema";
import { type ResolvedModifier, resolve, type Trace } from "@/features/dnd/derive/resolve";
import { isReference, isTarget, type Reference, type Target } from "@/features/dnd/derive/targets";

/**
 * A modifier that names something the engine cannot address. Thrown rather
 * than skipped: a record that silently does nothing is a wrong number at the
 * table with no way to notice. Carries the modifier's id and source so the
 * message points at the homebrew entry that produced it.
 */
export class ModifierValidationError extends Error {
  constructor(
    readonly modifier: Modifier,
    reason: string,
  ) {
    super(`Modifier ${modifier.id} (source ${modifier.source}): ${reason}`);
    this.name = "ModifierValidationError";
  }
}

/** The derived values this ticket covers, plus the trace for any of them. */
export type Derived = {
  /** Base scores with `ability.*` modifiers applied — what the sheet shows. */
  abilityScores: Record<Abil, number>;
  abilityModifiers: Record<Abil, number>;
  proficiencyBonus: number;
  maxHp: number;
  /** Why a value is what it is. Throws for a target this engine does not derive. */
  explain(target: DerivedTarget): Trace;
};

/** The targets `explain` can currently account for. Widens as #157 lands. */
export type DerivedTarget = "proficiencyBonus" | "maxHp" | `ability.${Abil}`;

/** PHB p.13: the modifier is `floor((score - 10) / 2)`, negatives included. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** PHB p.15. Derived from level, never read from a catalog — the catalog lies at 0. */
function baseProficiencyBonus(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

/**
 * Validates every modifier on the character, enabled or not.
 *
 * Disabled records are validated too: a typo that only surfaces when the
 * player flips the toggle mid-session is exactly the trap this vocabulary is
 * closed to prevent.
 */
function validate(modifiers: Modifier[]): void {
  for (const modifier of modifiers) {
    if (!isTarget(modifier.target)) {
      throw new ModifierValidationError(modifier, `unknown target "${modifier.target}"`);
    }
    if (typeof modifier.value === "object" && !isReference(modifier.value.ref)) {
      throw new ModifierValidationError(modifier, `unknown reference "${modifier.value.ref}"`);
    }
    // An override replaces the value outright, so any op but `set` is a
    // contradiction. Resolution would treat it as a set regardless; better to
    // reject it than to honour something the record does not say.
    if (modifier.source === "override" && modifier.op !== "set") {
      throw new ModifierValidationError(modifier, `an override must use op "set", not "${modifier.op}"`);
    }
  }
}

/** The values a `{ref}` may point at, all derived before any reference resolves. */
type ReferenceScope = {
  level: number;
  proficiencyBonus: number;
  scores: Record<Abil, number>;
  modifiers: Record<Abil, number>;
};

function resolveReference(ref: Reference, scope: ReferenceScope): number {
  if (ref === "level") {
    return scope.level;
  }
  if (ref === "proficiencyBonus") {
    return scope.proficiencyBonus;
  }

  const [kind, abil] = ref.split(".") as ["mod" | "score", Abil];
  return kind === "mod" ? scope.modifiers[abil] : scope.scores[abil];
}

/**
 * Picks the modifiers for one target and resolves their values against the
 * scope. Validation has already run, so the casts here are sound.
 */
function forTarget(modifiers: Modifier[], target: Target, scope: ReferenceScope): ResolvedModifier[] {
  return modifiers
    .filter((modifier) => modifier.target === target)
    .map(({ value, ...rest }) => ({
      ...rest,
      amount: typeof value === "number" ? value : resolveReference(value.ref as Reference, scope),
    }));
}

/**
 * The floor on max HP. A level 1 roll of 1 with CON 3 computes to -3, which is
 * not a hit point total any table would accept. The 2014 rules do not state
 * this minimum, so it is Sheetcraft's, not the SRD's — applied as a visible
 * trace step rather than a silent clamp, so `explain` never reports a value
 * its own steps do not produce.
 */
const MIN_MAX_HP = 1;

export function derive(character: CharacterRecord): Derived {
  validate(character.modifiers);

  const { modifiers, level } = character;

  // Ability scores resolve first and against an empty scope: they are what
  // every reference is expressed in terms of, so letting a `{ref:'mod.con'}`
  // reach an `ability.*` target would make resolution cyclic. A racial bonus
  // or ASI is a plain number, which is all this restriction costs.
  const emptyScope: ReferenceScope = {
    level,
    proficiencyBonus: 0,
    scores: blank(),
    modifiers: blank(),
  };

  const scoreTraces = {} as Record<Abil, Trace>;
  const scores = {} as Record<Abil, number>;
  const abilityModifiers = {} as Record<Abil, number>;
  for (const abil of ABILITIES) {
    const trace = resolve(character.abilities[abil], forTarget(modifiers, `ability.${abil}`, emptyScope));
    scoreTraces[abil] = trace;
    scores[abil] = trace.value;
    abilityModifiers[abil] = abilityModifier(trace.value);
  }

  const proficiencyScope: ReferenceScope = { level, proficiencyBonus: 0, scores, modifiers: abilityModifiers };
  const proficiencyTrace = resolve(
    baseProficiencyBonus(level),
    forTarget(modifiers, "proficiencyBonus", proficiencyScope),
  );

  // With abilities and proficiency settled, every reference can now resolve.
  const scope: ReferenceScope = {
    level,
    proficiencyBonus: proficiencyTrace.value,
    scores,
    modifiers: abilityModifiers,
  };

  // Per-level rolls, not a stored total, so a CON change recomputes correctly.
  // See CONTEXT.md § Hit point rolls.
  const baseMaxHp = sum(character.hpRolls) + abilityModifiers.con * level;
  const maxHpTrace = withFloor(
    resolve(baseMaxHp, forTarget(modifiers, "maxHp", scope)),
    MIN_MAX_HP,
    "Hit points cannot drop below 1",
  );

  return {
    abilityScores: scores,
    abilityModifiers,
    proficiencyBonus: proficiencyTrace.value,
    maxHp: maxHpTrace.value,
    explain(target) {
      if (target === "maxHp") {
        return maxHpTrace;
      }
      if (target === "proficiencyBonus") {
        return proficiencyTrace;
      }
      return scoreTraces[target.slice("ability.".length) as Abil];
    },
  };
}

/**
 * Raises a trace to a floor, recording the raise as a step. A clamp applied
 * outside the trace would leave `explain` reporting a value its steps do not
 * sum to — which is the one thing provenance exists to prevent.
 */
function withFloor(trace: Trace, floor: number, label: string): Trace {
  if (trace.value >= floor) {
    return trace;
  }

  return {
    ...trace,
    value: floor,
    steps: [...trace.steps, { id: "floor", source: "rule", label, op: "min", amount: floor, value: floor }],
  };
}

function blank(): Record<Abil, number> {
  return { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
