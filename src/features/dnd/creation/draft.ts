import {
  type AbilityDraft,
  type AbilityMethod,
  abilityMethodDefaults,
  isArrayComplete,
  isPointBuyValid,
  POINT_BUY_BUDGET,
} from "@/features/dnd/creation/abilities";
import { floatingBonusChoices, type RacialSource, racialModifiers } from "@/features/dnd/creation/racial-bonuses";
import { fixedAverageHpRolls } from "@/features/dnd/creation/starting-hp";
import type { CreateCharacterInput } from "@/features/dnd/db/characters-repository";
import type { Abil, Ref } from "@/features/dnd/db/schema";

/**
 * The creation draft: what the single scrolling `/dnd/create` page holds while
 * it is being filled in, and the rules that decide whether it may be submitted.
 *
 * Pure — no Dexie, no React. The two things it cannot know for itself, the
 * class's subclass threshold and the chosen race's entry, arrive as a
 * `DraftContext` the caller resolves. That is what makes every acceptance
 * rule testable without a browser. See ADR-0002.
 */

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 20;

export type CreationDraft = {
  name: string;
  level: number;
  classRef: Ref | null;
  subclassRef: Ref | null;
  raceRef: Ref | null;
  subraceRef: Ref | null;
  abilityMethod: AbilityMethod;
  abilities: AbilityDraft;
  /** The floating racial picks, in pick order. Empty for a race that asks for none. */
  floating: Abil[];
};

/** What the draft cannot derive for itself. Both default to "nothing known yet". */
export type DraftContext = {
  /** The chosen class's subclass threshold, from `subclassLevel`. */
  subclassLevel?: number | null;
  /** The chosen race's catalog entry, needed for its bonuses and floating choice. */
  race?: RacialSource | null;
  /** The chosen subrace's entry. */
  subrace?: RacialSource | null;
  /**
   * The chosen class's hit die (`classes[].hit_die`), for the starting
   * `hpRolls`. Structural SRD data, so it is read rather than hardcoded — and a
   * homebrew class declaring its own die gets correct hit points for free.
   */
  hitDie?: number | null;
};

/**
 * Why a draft cannot be submitted. A code plus the field it belongs to, so the
 * page can put the message next to the control rather than in a list at the
 * bottom.
 */
export type DraftIssue = {
  code: "name" | "class" | "race" | "level" | "subclass" | "abilities" | "floating";
  message: string;
};

export function emptyDraft(): CreationDraft {
  return {
    name: "",
    level: MIN_LEVEL,
    classRef: null,
    subclassRef: null,
    raceRef: null,
    subraceRef: null,
    abilityMethod: "manual",
    abilities: abilityMethodDefaults("manual"),
    floating: [],
  };
}

/**
 * Changes the level, KEEPING any chosen subclass. Below the threshold the
 * field hides; dropping the value there would lose a choice to a mis-tap on
 * the stepper, and the hidden value is simply not required.
 */
export function setLevel(draft: CreationDraft, level: number): CreationDraft {
  return { ...draft, level };
}

/**
 * Switches entry method and RESETS the spread to that method's defaults. A
 * silent clamp — a manual 18 quietly becoming a point-buy 15 — is more
 * surprising than an obvious reset, because the user never sees it happen.
 */
export function setAbilityMethod(draft: CreationDraft, method: AbilityMethod): CreationDraft {
  if (method === draft.abilityMethod) {
    return draft;
  }
  return { ...draft, abilityMethod: method, abilities: abilityMethodDefaults(method) };
}

/**
 * Changes the race, clearing the subrace when the race actually changed — a
 * subrace belongs to exactly one race, so carrying it across would leave a
 * combination that does not exist. The floating picks are deliberately KEPT:
 * they are ignored by `racialModifiers` unless the current race asks for them,
 * so re-picking a race restores the choice rather than losing it.
 */
export function setRace(draft: CreationDraft, raceRef: Ref | null): CreationDraft {
  if (raceRef === draft.raceRef) {
    return draft;
  }
  return { ...draft, raceRef, subraceRef: null };
}

/** Whether the subclass field is shown — and therefore required — at this level. */
export function showsSubclass(draft: CreationDraft, context: DraftContext): boolean {
  const threshold = context.subclassLevel;
  return threshold !== null && threshold !== undefined && draft.level >= threshold;
}

/** Whether the spread is complete and legal under the method that produced it. */
function abilitiesValid(draft: CreationDraft): boolean {
  switch (draft.abilityMethod) {
    case "standard-array":
      return isArrayComplete(draft.abilities);
    case "point-buy":
      return isPointBuyValid(draft.abilities);
    default:
      // Manual entry has no ceiling and no budget. There are deliberately no
      // balance warnings: mechanical sanity is the table's business, not the
      // app's.
      return Object.values(draft.abilities).every((score) => score !== null);
  }
}

/**
 * Why the spread is not acceptable — named by the ACTUAL fault, not by the
 * method. A blank score under point buy is a blank score; reporting it as
 * "over the 27-point budget" would send the user hunting for points they have
 * not spent.
 */
function abilitiesMessage(draft: CreationDraft): string {
  if (draft.abilityMethod === "standard-array") {
    return "Assign every value in the array.";
  }

  if (Object.values(draft.abilities).some((score) => score === null)) {
    return "Every ability needs a score.";
  }

  return draft.abilityMethod === "point-buy"
    ? `You are over the ${POINT_BUY_BUDGET}-point budget.`
    : "Every ability needs a score.";
}

/**
 * Every rule the draft breaks, all at once rather than the first — a form that
 * reveals one problem per attempt is a form filled in by trial and error.
 */
export function draftIssues(draft: CreationDraft, context: DraftContext = {}): DraftIssue[] {
  const issues: DraftIssue[] = [];

  if (draft.name.trim() === "") {
    issues.push({ code: "name", message: "Give your character a name." });
  }

  if (!draft.classRef) {
    issues.push({ code: "class", message: "Choose a class." });
  }

  if (!draft.raceRef) {
    issues.push({ code: "race", message: "Choose a race." });
  }

  if (!Number.isInteger(draft.level) || draft.level < MIN_LEVEL || draft.level > MAX_LEVEL) {
    issues.push({ code: "level", message: `Level must be between ${MIN_LEVEL} and ${MAX_LEVEL}.` });
  }

  if (showsSubclass(draft, context) && !draft.subclassRef) {
    issues.push({ code: "subclass", message: "Choose a subclass." });
  }

  if (!abilitiesValid(draft)) {
    issues.push({ code: "abilities", message: abilitiesMessage(draft) });
  }

  const choice = floatingBonusChoices(context.race ?? null);
  if (choice) {
    const picks = draft.floating.slice(0, choice.choose);
    const distinct = new Set(picks.filter((abil) => choice.from.includes(abil)));
    if (distinct.size < choice.choose) {
      issues.push({
        code: "floating",
        message: `Choose ${choice.choose} different abilities for the +${choice.bonus} bonus.`,
      });
    }
  }

  return issues;
}

export function isDraftValid(draft: CreationDraft, context: DraftContext = {}): boolean {
  return draftIssues(draft, context).length === 0;
}

/**
 * Turns a valid draft into what the repository takes, or `null` when the draft
 * is not submittable — the page disables its button on the same predicate, so
 * `null` here is a second line rather than the first.
 *
 * The abilities are stored EXACTLY as entered. Racial bonuses come back as
 * modifiers alongside, never folded into the scores.
 */
export function buildCreateInput(draft: CreationDraft, context: DraftContext = {}): CreateCharacterInput | null {
  if (!isDraftValid(draft, context)) {
    return null;
  }

  // Narrowed by `isDraftValid`: an invalid draft has already returned.
  const classRef = draft.classRef as Ref;
  const raceRef = draft.raceRef as Ref;

  return {
    // The racial bonuses ride along as records; the scores below stay exactly
    // as entered.
    modifiers: racialModifiers({
      race: context.race ?? null,
      subrace: context.subrace ?? null,
      floating: draft.floating,
    }),
    name: draft.name.trim(),
    level: draft.level,
    classRef,
    raceRef,
    // Kept even when the field is hidden below the threshold — the value was
    // preserved on purpose, so it is stored.
    subclassRef: draft.subclassRef,
    subraceRef: draft.subraceRef,
    abilities: draft.abilities as Record<Abil, number>,
    // One roll per level, the fixed average rather than a die roll: creation
    // does not roll. They are stored as ordinary inputs, so editing them later
    // is editing an input. See CONTEXT.md § Hit point rolls.
    hpRolls: fixedAverageHpRolls(context.hitDie, draft.level),
  };
}
