import { describe, expect, it } from "vitest";
import { fixedAverageHpRolls, hitDieAverage } from "@/features/dnd/creation/starting-hp";

/**
 * PHB p.15 and each class's "Hit Points" block, transcribed:
 *
 * - **Level 1** is the FULL hit die, never an average. "Hit Points at 1st
 *   Level: 12 + your Constitution modifier" for a barbarian (d12).
 * - **Every level after** is either a roll or the die's fixed average, which
 *   the rules give as `die / 2 + 1` — 7 for a d12, 6 for a d10, 5 for a d8.
 *
 * Sheetcraft takes the average, because creation does not roll dice. The rolls
 * remain an input the player can edit later. See CONTEXT.md § Hit point rolls.
 */

describe("hitDieAverage", () => {
  // The published values, not `die / 2 + 1` recomputed — that is the formula
  // under test.
  it.each([
    [6, 4],
    [8, 5],
    [10, 6],
    [12, 7],
  ])("a d%i averages %i", (die, expected) => {
    expect(hitDieAverage(die)).toBe(expected);
  });
});

describe("fixedAverageHpRolls", () => {
  it("gives a level 1 character the full hit die", () => {
    expect(fixedAverageHpRolls(12, 1)).toEqual([12]);
  });

  it("gives every level after the average", () => {
    expect(fixedAverageHpRolls(12, 4)).toEqual([12, 7, 7, 7]);
  });

  it("matches the published barbarian at level 8", () => {
    // 12 at first, then seven levels of 7.
    expect(fixedAverageHpRolls(12, 8)).toEqual([12, 7, 7, 7, 7, 7, 7, 7]);
  });

  it("matches a d8 class", () => {
    expect(fixedAverageHpRolls(8, 3)).toEqual([8, 5, 5]);
  });

  it("produces one roll per level", () => {
    expect(fixedAverageHpRolls(10, 20)).toHaveLength(20);
  });

  it("is empty below level 1 rather than inventing a roll", () => {
    expect(fixedAverageHpRolls(10, 0)).toEqual([]);
  });

  it("falls back to a d8 for a class whose hit die does not resolve", () => {
    // The SRD's most common die. A dangling class ref must not produce a
    // character with no hit points at all.
    expect(fixedAverageHpRolls(null, 2)).toEqual([8, 5]);
  });
});
