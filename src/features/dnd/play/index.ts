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
export { signed, titleCase, unknownRefLabel } from "@/features/dnd/play/format";
export type { HpCommit, HpPool, HpStatus } from "@/features/dnd/play/hp";
export { applyDamage, applyHeal, applyHpCommit, applyTempHp, hpStatus } from "@/features/dnd/play/hp";
export type {
  ProficiencyEntry,
  ProficiencyGroup,
  ProficiencyKind,
  SpellEntry,
  SpellSection,
} from "@/features/dnd/play/sections";
export { groupProficiencies, spellSection } from "@/features/dnd/play/sections";
export { loadDeriveContext } from "@/features/dnd/play/sheet-context";
export { SheetTabs } from "@/features/dnd/play/sheet-tabs";
export type { FeatureEntry, TabData } from "@/features/dnd/play/tab-data";
export { loadTabData } from "@/features/dnd/play/tab-data";
export type { CurrencyRow, SheetTab, SheetTabId } from "@/features/dnd/play/tabs";
export { CHARACTER_FIELD_HOMES, currencyRows, SHEET_TABS, tabForField } from "@/features/dnd/play/tabs";
