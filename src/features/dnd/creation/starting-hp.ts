/**
 * The hit-point rolls a character is created with.
 *
 * `hpRolls` is the one input that looks derived but isn't: at each level-up a
 * 2014 player either rolls a hit die or takes the fixed average, so the roll is
 * a genuine input and is stored per level rather than as a total. See
 * CONTEXT.md § Hit point rolls.
 *
 * Creation does not roll dice — it takes the fixed average, which is the option
 * the rules already offer and the one a player who has not rolled yet would
 * pick. Because the values are stored as ordinary rolls, editing them later is
 * editing an input, with nothing special-cased about how they got there.
 */

/**
 * The SRD's own fixed average for a hit die: `die / 2 + 1`. A d8 gives 5, not
 * the arithmetic mean of 4.5 — the rules round in the player's favour and state
 * the result directly.
 */
export function hitDieAverage(die: number): number {
  return Math.floor(die / 2) + 1;
}

/**
 * The most common hit die in the SRD, used when a class ref does not resolve.
 *
 * A dangling ref must not produce a character with no hit points at all: that
 * character opens on the death-save panel, which is a far louder lie than a
 * hit die off by two. See CONTEXT.md § Catalog reference.
 */
const FALLBACK_HIT_DIE = 8;

/**
 * One roll per level: the full die at level 1, the fixed average thereafter.
 *
 * Level 1 is not an average — "Hit Points at 1st Level" is the whole die in
 * every class's block, and averaging it would cost every character several
 * points they are owed.
 */
export function fixedAverageHpRolls(hitDie: number | null | undefined, level: number): number[] {
  if (level < 1) {
    return [];
  }

  const die = typeof hitDie === "number" && hitDie > 0 ? hitDie : FALLBACK_HIT_DIE;
  const average = hitDieAverage(die);

  return [die, ...Array.from({ length: level - 1 }, () => average)];
}
