/**
 * Death saves: three success pips, three failure pips, and the two outcomes
 * they resolve to. PHB p.197.
 *
 * The rules Sheetcraft *does* implement are the counting ones — three
 * successes stabilise, three failures kill. The d20 roll itself is the
 * player's, as is the natural-1/natural-20 special casing, because the app
 * never rolls dice. What it does is remember, which is the part a table loses
 * track of.
 *
 * Pure, like the rest of `play/`.
 */
import type { DeathSaveCount } from "@/features/dnd/db/schema";

export type DeathSaves = {
  successes: DeathSaveCount;
  failures: DeathSaveCount;
};

/** Which row a pip belongs to. */
export type DeathSaveRow = "successes" | "failures";

/** The resolved state of a set of pips, or `null` while it is still in play. */
export type DeathSaveOutcome = "stable" | "dead" | null;

export const DEATH_SAVE_PIPS = 3;

/** All pips clear — what a character returns to on being healed from 0. */
export const NO_DEATH_SAVES: DeathSaves = { successes: 0, failures: 0 };

/**
 * The pip indexes a row renders, 1-based. Exported so the component never
 * hardcodes `[1, 2, 3]` beside a `DEATH_SAVE_PIPS` that could change.
 */
export const DEATH_SAVE_INDEXES: readonly number[] = Array.from({ length: DEATH_SAVE_PIPS }, (_, i) => i + 1);

function isCount(value: number): value is DeathSaveCount {
  return value >= 0 && value <= DEATH_SAVE_PIPS;
}

/**
 * Tapping a pip. The gesture is "set this row to this many", with one
 * exception: tapping the pip that is currently the last filled one clears it,
 * so a mis-tap is undone by repeating it rather than by hunting for the pip
 * below.
 *
 * That exception is why this is a function and not `set(row, index)` — without
 * it there is no tap that ever *lowers* a count from 1 to 0.
 */
export function toggleDeathSave(saves: DeathSaves, row: DeathSaveRow, index: number): DeathSaves {
  if (!Number.isInteger(index) || index < 1 || index > DEATH_SAVE_PIPS) {
    return saves;
  }

  const filled = saves[row];
  const next = filled === index ? index - 1 : index;

  if (!isCount(next)) {
    return saves;
  }
  return { ...saves, [row]: next };
}

/**
 * Whether the pips have resolved. Death is checked first: at three failures
 * the character is dead regardless of what the success row holds, and a set of
 * pips reading three-and-three is a state the rules never produce but a mis-tap
 * easily does.
 */
export function deathSaveOutcome(saves: DeathSaves): DeathSaveOutcome {
  if (saves.failures >= DEATH_SAVE_PIPS) {
    return "dead";
  }
  if (saves.successes >= DEATH_SAVE_PIPS) {
    return "stable";
  }
  return null;
}
