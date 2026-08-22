/**
 * Play mode's public surface. Import from here, not from the modules behind
 * it — the split between the HP arithmetic, the projections and the components
 * is free to move.
 */

export { CharacterSheet } from "@/features/dnd/play/character-sheet";
export type { Condition } from "@/features/dnd/play/conditions";
export { CONDITIONS, conditionRef, findCondition, isConditionRef } from "@/features/dnd/play/conditions";
export type { DeathSaveOutcome, DeathSaveRow, DeathSaves } from "@/features/dnd/play/death-saves";
export { deathSaveOutcome, NO_DEATH_SAVES, toggleDeathSave } from "@/features/dnd/play/death-saves";
export type { ConditionState, EffectGroups } from "@/features/dnd/play/effects";
export {
  activeConditions,
  activeEffects,
  activeOverrides,
  clearOverride,
  describeModifier,
  effectGroups,
  toggleCondition,
  toggleEffect,
} from "@/features/dnd/play/effects";
export type { HpCommit, HpPool, HpStatus } from "@/features/dnd/play/hp";
export { applyDamage, applyHeal, applyHpCommit, applyTempHp, hpStatus } from "@/features/dnd/play/hp";
export { loadDeriveContext } from "@/features/dnd/play/sheet-context";
