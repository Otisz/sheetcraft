/**
 * The derivation engine's public surface. Import from here, not from the
 * modules behind it — the internal split between validation, resolution and
 * derivation is free to move.
 */

export type { ArmorClassData, DeriveContext, EquippedArmor, SlotsByLevel, Weapon } from "@/features/dnd/derive/context";
export { DEFAULT_HIT_DIE, DEFAULT_SPEED, EMPTY_CONTEXT } from "@/features/dnd/derive/context";
export type { Attack, Derived, DerivedTarget, HitDice, SpellSlotPool } from "@/features/dnd/derive/derive";
export { abilityModifier, derive, ModifierValidationError } from "@/features/dnd/derive/derive";
export type { Step, Trace } from "@/features/dnd/derive/resolve";
export type { EnumerableTarget, Reference, Skill, Target } from "@/features/dnd/derive/targets";
export { DERIVED_TARGETS, isReference, isTarget, SKILLS } from "@/features/dnd/derive/targets";
