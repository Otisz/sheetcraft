/**
 * The creation feature's public surface. Import from here, not from the
 * modules behind it — the split between the draft rules, the catalog reads and
 * the form is free to move.
 */

export type { AbilityDraft, AbilityMethod, AbilityScores } from "@/features/dnd/creation/abilities";
export {
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
} from "@/features/dnd/creation/abilities";
export { CreateCharacterForm } from "@/features/dnd/creation/create-character-form";
export type { CreationDraft, DraftContext, DraftIssue } from "@/features/dnd/creation/draft";
export {
  buildCreateInput,
  draftIssues,
  emptyDraft,
  isDraftValid,
  MAX_LEVEL,
  MIN_LEVEL,
} from "@/features/dnd/creation/draft";
export type { FeatureSource } from "@/features/dnd/creation/feature-modifiers";
export { featureModifiers, hasFeatureModifiers, syncFeatureModifiers } from "@/features/dnd/creation/feature-modifiers";
export type { FloatingChoice, RacialSource } from "@/features/dnd/creation/racial-bonuses";
export { floatingBonusChoices, racialModifiers } from "@/features/dnd/creation/racial-bonuses";
export { subclassLevel, subclassRequired } from "@/features/dnd/creation/subclass-timing";
