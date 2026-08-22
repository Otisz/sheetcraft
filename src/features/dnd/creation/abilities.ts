import { ABILITIES, type Abil } from "@/features/dnd/db/schema";

/**
 * The three ways a 2014 character's base scores get entered, and the arithmetic
 * each one owes the form.
 *
 * These are BASE scores. Racial bonuses never appear here — they arrive as
 * modifier records applied *after* this, which is why a dwarf legitimately
 * reaches CON 17 from a point-buy 15. See CONTEXT.md § Input vs derived.
 */

export type AbilityMethod = "manual" | "standard-array" | "point-buy";

/** A spread being edited. `null` is "not assigned yet", which only the array uses. */
export type AbilityDraft = Record<Abil, number | null>;

/** A finished spread — every ability carries a number. */
export type AbilityScores = Record<Abil, number>;

/** PHB p.13. Assigned to the six abilities in any order, each value once. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
export const POINT_BUY_BUDGET = 27;

/**
 * PHB p.13. Linear to 13, then 2 per point — which is the whole reason 15 is
 * an expensive choice rather than an obvious one.
 */
export const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

/** Manual entry's neutral start. */
const MANUAL_DEFAULT_SCORE = 10;

/**
 * What a score outside the point-buy table costs. Not zero, and not an
 * exception: an out-of-range score has to read as *unaffordable* so the budget
 * check rejects it, rather than as free.
 */
const UNAFFORDABLE = POINT_BUY_BUDGET + 1;

/**
 * The spread a method starts from. Switching method RESETS to these rather
 * than clamping what came before: a silent clamp of a manual 18 down to 15 is
 * more surprising than an obvious reset, because the user never sees it happen.
 */
export function abilityMethodDefaults(method: AbilityMethod): AbilityDraft {
  const starting = method === "manual" ? MANUAL_DEFAULT_SCORE : method === "point-buy" ? POINT_BUY_MIN : null;
  return Object.fromEntries(ABILITIES.map((abil) => [abil, starting])) as AbilityDraft;
}

/**
 * Points spent on a spread. An out-of-range score contributes more than the
 * whole budget, so `spent > POINT_BUY_BUDGET` is the single check the form
 * needs — it catches both overspending and an impossible score.
 */
export function pointBuySpent(draft: AbilityDraft): number {
  return ABILITIES.reduce((sum, abil) => {
    const score = draft[abil];
    if (score === null) {
      return sum + UNAFFORDABLE;
    }
    return sum + (POINT_BUY_COST[score] ?? UNAFFORDABLE);
  }, 0);
}

/** What is left to spend. Negative when overspent — the form shows the number either way. */
export function pointBuyRemaining(draft: AbilityDraft): number {
  return POINT_BUY_BUDGET - pointBuySpent(draft);
}

/** Every ability in range and the budget not exceeded. */
export function isPointBuyValid(draft: AbilityDraft): boolean {
  return pointBuySpent(draft) <= POINT_BUY_BUDGET;
}

/**
 * Whether the six abilities use each standard-array value exactly once.
 * Compared as sorted multisets, so a duplicate is caught by the value that
 * went missing to make room for it.
 */
export function isArrayComplete(draft: AbilityDraft): boolean {
  const assigned = ABILITIES.map((abil) => draft[abil]);
  if (assigned.some((score) => score === null)) {
    return false;
  }

  const sorted = [...(assigned as number[])].sort((a, b) => b - a);
  return sorted.every((score, i) => score === STANDARD_ARRAY[i]);
}

/**
 * Which standard-array values are still unassigned, as a multiset — what the
 * per-ability picker offers. Duplicate values in the array would each appear
 * once here; the 2014 array has none, but the removal is by occurrence so it
 * stays correct if a value ever repeats.
 */
export function remainingArrayValues(draft: AbilityDraft): number[] {
  const remaining = [...STANDARD_ARRAY] as number[];
  for (const abil of ABILITIES) {
    const score = draft[abil];
    if (score === null) {
      continue;
    }
    const at = remaining.indexOf(score);
    if (at !== -1) {
      remaining.splice(at, 1);
    }
  }
  return remaining;
}

/** A complete standard-array assignment as scores, or `null` while it is unfinished. */
export function standardArrayScores(draft: AbilityDraft): AbilityScores | null {
  return isArrayComplete(draft) ? (draft as AbilityScores) : null;
}
