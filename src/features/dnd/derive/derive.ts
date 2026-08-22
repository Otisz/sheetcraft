/**
 * The derivation engine: `(character) → derived values + provenance`.
 *
 * Pure by construction — no Dexie, no React, no network, no clock. Everything
 * it needs arrives as an argument, which is what makes the rules-correctness
 * surface testable against transcribed rulebook values rather than against
 * itself. See ADR-0002.
 *
 * This module covers every derived value on the sheet: abilities, proficiency
 * bonus, max HP, AC, skills, saves, passive perception and spellcasting.
 *
 * The catalog data AC and spellcasting need — armor's `{base, dex_bonus,
 * max_bonus}`, the class's spellcasting ability — arrives as a `DeriveContext`
 * the caller resolves, because the engine cannot reach Dexie and stay pure.
 */
import {
  ABILITIES,
  type Abil,
  type CharacterRecord,
  type Modifier,
  SPELL_SLOT_LEVELS,
  type SpellSlotLevel,
} from "@/features/dnd/db/schema";
import {
  DEFAULT_HIT_DIE,
  DEFAULT_SPEED,
  type DeriveContext,
  type EquippedArmor,
  type Weapon,
} from "@/features/dnd/derive/context";
import { type ResolvedModifier, resolve, type Trace } from "@/features/dnd/derive/resolve";
import { isReference, isTarget, type Reference, SKILLS, type Skill, type Target } from "@/features/dnd/derive/targets";

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

/**
 * The hit dice pool. PHB p.186: one die per level, of the class's own size,
 * spent on a short rest and regained on a long one.
 *
 * `total` is derived from level rather than stored, so a level-up grows the
 * pool with no migration; `spent` is the play state the steppers write.
 */
export type HitDice = {
  /** The die size — 12 for a barbarian. */
  die: number;
  total: number;
  spent: number;
  remaining: number;
};

/** One slot level's pool, in the same derived-max / stored-spent shape. */
export type SpellSlotPool = {
  level: SpellSlotLevel;
  total: number;
  expended: number;
  remaining: number;
};

/**
 * One weapon's attack line, as the Combat tab renders it.
 *
 * Damage is kept as `dice` plus a separate `bonus` rather than as a formatted
 * `1d8+3` string: Sheetcraft does not roll, so the sheet is the only thing that
 * formats, and a modifier that moves the bonus must not have to rewrite prose.
 */
export type Attack = {
  /** The weapon's `index` — the id in `attack.<id>.hit`. */
  index: string;
  name: string;
  /** Which ability the attack and damage rolls key off, finesse already resolved. */
  ability: Abil;
  toHit: number;
  damageDice: string;
  damageBonus: number;
  damageType: string;
};

/** The derived values this ticket covers, plus the trace for any of them. */
export type Derived = {
  /** Base scores with `ability.*` modifiers applied — what the sheet shows. */
  abilityScores: Record<Abil, number>;
  abilityModifiers: Record<Abil, number>;
  proficiencyBonus: number;
  maxHp: number;
  armorClass: number;
  /** The DEX check that orders combat — a raw ability check, never proficient. */
  initiative: number;
  /** Walking speed in feet, from the race's own `speed`. */
  speed: number;
  /** Every skill's check modifier, proficiency and expertise included. */
  skills: Record<Skill, number>;
  saves: Record<Abil, number>;
  passivePerception: number;
  /** `null` for a non-caster — a number there would be one the sheet cannot tell from a real one. */
  spellSaveDc: number | null;
  spellAttackBonus: number | null;
  /** The hit dice pool the Combat tab steppers spend from. */
  hitDice: HitDice;
  /** One row per slot level the character actually has. Empty for a non-caster. */
  spellSlots: SpellSlotPool[];
  /** How many cantrips the class knows — cast at will, so never a slot row. */
  cantripsKnown: number;
  /** One entry per carried weapon, with the to-hit and damage the sheet shows. */
  attacks: Attack[];
  /** Why a value is what it is. Throws for a target this engine does not derive. */
  explain(target: DerivedTarget): Trace;
};

/** Every target `explain` accounts for — which is every target the vocabulary has. */
export type DerivedTarget =
  | "proficiencyBonus"
  | "maxHp"
  | "ac"
  | "initiative"
  | "speed"
  | "passivePerception"
  | "spell.saveDc"
  | "spell.attack"
  | `ability.${Abil}`
  | `save.${Abil}`
  | `skill.${Skill}`;

/** PHB p.13: the modifier is `floor((score - 10) / 2)`, negatives included. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** PHB p.15. Derived from level, never read from a catalog — the catalog lies at 0. */
function baseProficiencyBonus(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

/**
 * The AC base formula, over structural armor data only. Everything a *feature*
 * contributes — Unarmored Defense, a magic item, a homebrew ruling — arrives as
 * a modifier record instead, because SRD features are prose-only.
 *
 * Shields are excluded here by the caller: the SRD stores the Shield as an
 * armor entry whose `base: 2` is **additive, not absolute**, so treating it as
 * the base armor would produce an AC of 2.
 */
function baseArmorClass(armor: EquippedArmor | undefined, dexModifier: number): number {
  if (!armor) {
    return 10 + dexModifier;
  }
  if (!armor.dexBonus) {
    return armor.base;
  }

  // `max_bonus` is **absent** rather than null on unlimited-dex light armor,
  // so missing means uncapped. Reading it as 0 costs a DEX 18 rogue four
  // points of AC. Confirmed against the vendored data.
  const cap = armor.maxBonus ?? Number.POSITIVE_INFINITY;
  return armor.base + Math.min(dexModifier, cap);
}

/** PHB p.175: `10 + the perception check modifier`. */
const PASSIVE_BASE = 10;

/** PHB p.205: `8 + proficiency + the spellcasting ability modifier`. */
const SPELL_SAVE_DC_BASE = 8;

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

/**
 * The floor on speed. Nothing in the 2014 rules reduces a speed below 0 — the
 * effects that stop you (grappled, restrained) set it to 0 outright — so this
 * catches a homebrew or override that subtracts too much. Like the HP floor it
 * is a visible trace step, never a silent clamp.
 */
const MIN_SPEED = 0;

export function derive(character: CharacterRecord, context: DeriveContext): Derived {
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

  // Shields are partitioned out before the base formula, never into it: the
  // Shield's `base: 2` is additive in the SRD. Each becomes a step, so the
  // trace reads `base 16 → +2 shield` exactly as the sheet shows it.
  const bodyArmor = context.armor.find((piece) => !piece.isShield);
  const shields: ResolvedModifier[] = context.armor
    .filter((piece) => piece.isShield)
    .map((piece, index) => ({
      // The index disambiguates: `source` names what the modifier came from,
      // `id` must identify this one record even if the same item appears twice.
      id: `equip:${piece.index}:${index}`,
      source: `equip:${piece.index}`,
      target: "ac",
      op: "add" as const,
      enabled: true,
      label: piece.name,
      amount: piece.base,
    }));

  const acTrace = resolve(baseArmorClass(bodyArmor, abilityModifiers.dex), [
    ...shields,
    ...forTarget(modifiers, "ac", scope),
  ]);

  // A raw DEX check (PHB p.189) — no proficiency bonus. Reads the *derived*
  // modifier, so a racial bonus or an ASI has already moved it.
  const initiativeTrace = resolve(abilityModifiers.dex, forTarget(modifiers, "initiative", scope));

  // The race's own `speed`, which is structural SRD data the caller resolved.
  const speedTrace = withFloor(
    resolve(context.speed ?? DEFAULT_SPEED, forTarget(modifiers, "speed", scope)),
    MIN_SPEED,
    "Speed cannot drop below 0",
  );

  const saveTraces = {} as Record<Abil, Trace>;
  const saves = {} as Record<Abil, number>;
  for (const abil of ABILITIES) {
    // A proficient save adds the bonus to the base. It is not a modifier
    // record, so it is not a step — inventing one would put an entry in the
    // trace that nothing in the character's data corresponds to.
    const base = abilityModifiers[abil] + (character.proficiencies.saves.includes(abil) ? proficiencyTrace.value : 0);
    const trace = resolve(base, forTarget(modifiers, `save.${abil}`, scope));
    saveTraces[abil] = trace;
    saves[abil] = trace.value;
  }

  const skillTraces = {} as Record<Skill, Trace>;
  const skills = {} as Record<Skill, number>;
  for (const skill of Object.keys(SKILLS) as Skill[]) {
    // A character listed for expertise is proficient by definition, so
    // expertise alone still counts once for proficiency.
    const expert = context.expertise.includes(skill);
    const proficient = expert || context.skillProficiencies.includes(skill);

    const base = abilityModifiers[SKILLS[skill]] + (proficient ? proficiencyTrace.value : 0);

    // Expertise doubles the proficiency bonus (PHB p.96) as a *second helping
    // of the same bonus* — an `add` of `{ref:'proficiencyBonus'}`, never a
    // special doubling op. Because it is a record it appears in the trace, and
    // because it is a reference it moves when the bonus does.
    const expertiseModifier: ResolvedModifier[] = expert
      ? [
          {
            id: `expertise:${skill}`,
            source: "feature:expertise",
            target: `skill.${skill}`,
            op: "add",
            enabled: true,
            label: "Expertise",
            amount: proficiencyTrace.value,
          },
        ]
      : [];

    const trace = resolve(base, [...expertiseModifier, ...forTarget(modifiers, `skill.${skill}`, scope)]);
    skillTraces[skill] = trace;
    skills[skill] = trace.value;
  }

  // The passive score follows the perception check, so anything that moved the
  // check has already moved this — `passivePerception` records land on top.
  const passiveTrace = resolve(PASSIVE_BASE + skills.perception, forTarget(modifiers, "passivePerception", scope));

  // A non-caster has no DC and no attack bonus. `null` rather than a number the
  // sheet could not tell from a real one.
  const spellAbility = context.spellcastingAbility;
  const saveDcTrace = spellAbility
    ? resolve(
        SPELL_SAVE_DC_BASE + proficiencyTrace.value + abilityModifiers[spellAbility],
        forTarget(modifiers, "spell.saveDc", scope),
      )
    : null;
  const spellAttackTrace = spellAbility
    ? resolve(proficiencyTrace.value + abilityModifiers[spellAbility], forTarget(modifiers, "spell.attack", scope))
    : null;

  // One die per level (PHB p.186). `remaining` floors at 0 rather than going
  // negative: a level-down after spending dice would otherwise read "-1 left",
  // and a pool cannot owe you dice.
  const hitDiceTotal = level;
  const hitDiceSpent = character.play.hitDiceSpent;
  const hitDice: HitDice = {
    die: context.hitDie ?? DEFAULT_HIT_DIE,
    total: hitDiceTotal,
    spent: hitDiceSpent,
    remaining: Math.max(0, hitDiceTotal - hitDiceSpent),
  };

  // Only the levels the character genuinely has slots in. The SRD stores
  // explicit zeroes for the rest, and a row reading "0 / 0" is noise on a
  // phone. Ascending, because that is the order a caster reads them in.
  const spellSlots: SpellSlotPool[] = SPELL_SLOT_LEVELS.flatMap((slotLevel) => {
    const total = context.slotsByLevel?.[slotLevel] ?? 0;
    if (total <= 0) {
      return [];
    }

    const expended = character.play.slotsExpended[slotLevel];
    return [{ level: slotLevel, total, expended, remaining: Math.max(0, total - expended) }];
  });

  const attacks: Attack[] = (context.weapons ?? []).map((weapon) => {
    const ability = attackAbility(weapon, abilityModifiers);

    // Proficiency applies to the attack roll and never to damage (PHB p.194) —
    // which is why the two resolutions start from different bases rather than
    // sharing one.
    const hitBase = abilityModifiers[ability] + (weapon.proficient ? proficiencyTrace.value : 0);
    const hitTrace = resolve(hitBase, forTarget(modifiers, `attack.${weapon.index}.hit`, scope));
    const damageTrace = resolve(
      abilityModifiers[ability],
      forTarget(modifiers, `attack.${weapon.index}.damage`, scope),
    );

    return {
      index: weapon.index,
      name: weapon.name,
      ability,
      toHit: hitTrace.value,
      damageDice: weapon.damageDice,
      damageBonus: damageTrace.value,
      damageType: weapon.damageType,
    };
  });

  return {
    abilityScores: scores,
    abilityModifiers,
    proficiencyBonus: proficiencyTrace.value,
    maxHp: maxHpTrace.value,
    armorClass: acTrace.value,
    initiative: initiativeTrace.value,
    speed: speedTrace.value,
    skills,
    saves,
    passivePerception: passiveTrace.value,
    spellSaveDc: saveDcTrace?.value ?? null,
    spellAttackBonus: spellAttackTrace?.value ?? null,
    hitDice,
    spellSlots,
    cantripsKnown: context.cantripsKnown ?? 0,
    attacks,
    explain(target) {
      if (target === "maxHp") {
        return maxHpTrace;
      }
      if (target === "proficiencyBonus") {
        return proficiencyTrace;
      }
      if (target === "ac") {
        return acTrace;
      }
      if (target === "initiative") {
        return initiativeTrace;
      }
      if (target === "speed") {
        return speedTrace;
      }
      if (target === "passivePerception") {
        return passiveTrace;
      }
      if (target === "spell.saveDc" || target === "spell.attack") {
        const trace = target === "spell.saveDc" ? saveDcTrace : spellAttackTrace;
        if (!trace) {
          throw new Error(`Cannot explain ${target}: this character has no spellcasting ability`);
        }
        return trace;
      }
      if (target.startsWith("save.")) {
        return saveTraces[target.slice("save.".length) as Abil];
      }
      if (target.startsWith("skill.")) {
        return skillTraces[target.slice("skill.".length) as Skill];
      }
      return scoreTraces[target.slice("ability.".length) as Abil];
    },
  };
}

/**
 * Which ability a weapon attacks with.
 *
 * PHB p.194: melee keys off STR, ranged off DEX. Finesse (p.195) lets the
 * attacker *choose* — so the sheet shows the better of the two, which is the
 * choice every player makes and the one a sheet can make on their behalf
 * without being wrong. A finesse weapon that is also ranged (a thrown dagger)
 * is still a choice, so finesse is checked first.
 */
function attackAbility(weapon: Weapon, abilityModifiers: Record<Abil, number>): Abil {
  if (weapon.finesse) {
    return abilityModifiers.dex > abilityModifiers.str ? "dex" : "str";
  }
  return weapon.ranged ? "dex" : "str";
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
