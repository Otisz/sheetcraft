/**
 * The derivation engine's public surface. Import from here, not from the
 * modules behind it — the internal split between validation, resolution and
 * derivation is free to move.
 */

export type { ArmorClassData, DeriveContext, EquippedArmor } from "@/features/dnd/derive/context";
export { EMPTY_CONTEXT } from "@/features/dnd/derive/context";
export type { Derived, DerivedTarget } from "@/features/dnd/derive/derive";
export { abilityModifier, derive, ModifierValidationError } from "@/features/dnd/derive/derive";
export type { Step, Trace } from "@/features/dnd/derive/resolve";
export type { Reference, Skill, Target } from "@/features/dnd/derive/targets";
export { isReference, isTarget, SKILLS } from "@/features/dnd/derive/targets";
