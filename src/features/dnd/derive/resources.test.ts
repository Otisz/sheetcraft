/**
 * The two per-rest pools the Combat and Spells tabs track: hit dice and spell
 * slots. Both have a derived maximum and a stored spent count, and neither
 * maximum is ever stored — see CONTEXT.md § Input vs derived.
 *
 * Expected values are transcribed from PHB p.186 (hit dice) and the class
 * tables on p.53 (cleric) and p.113 (wizard), not computed by the engine.
 */
import { describe, expect, it } from "vitest";
import { EMPTY_CONTEXT } from "@/features/dnd/derive/context";
import { derive } from "@/features/dnd/derive/derive";
import { makeCharacter, makeContext } from "@/features/dnd/derive/fixtures";

describe("hit dice", () => {
  it("has one die per level, of the class's own size", () => {
    // PHB p.186: a character has one hit die per level, and a barbarian's is
    // a d12.
    const character = makeCharacter({ level: 5, hpRolls: [12, 7, 7, 7, 7] });

    const { hitDice } = derive(character, makeContext({ hitDie: 12 }));

    expect(hitDice.total).toBe(5);
    expect(hitDice.die).toBe(12);
  });

  it("reports what is left after spending some", () => {
    const character = makeCharacter({
      level: 5,
      hpRolls: [12, 7, 7, 7, 7],
      play: { ...makeCharacter().play, hitDiceSpent: 2 },
    });

    expect(derive(character, makeContext({ hitDie: 12 })).hitDice.remaining).toBe(3);
  });

  it("never reports a negative remainder", () => {
    // A level-down after spending dice would otherwise show -1 dice left.
    const character = makeCharacter({ play: { ...makeCharacter().play, hitDiceSpent: 4 } });

    expect(derive(character, makeContext({ hitDie: 8 })).hitDice.remaining).toBe(0);
  });

  it("falls back to a d8 when the class ref does not resolve", () => {
    // The same degrade-rather-than-throw the rest of the sheet does with a
    // dangling ref. A d8 is the SRD's most common hit die.
    expect(derive(makeCharacter(), EMPTY_CONTEXT).hitDice.die).toBe(8);
  });
});

describe("spell slots", () => {
  it("is empty for a non-caster", () => {
    // A barbarian's level row carries no `spellcasting` block at all.
    expect(derive(makeCharacter(), EMPTY_CONTEXT).spellSlots).toEqual([]);
  });

  it("lists only the levels the character actually has slots in", () => {
    // PHB p.113, wizard 3: four 1st-level slots and two 2nd-level. The SRD
    // stores zeroes for levels 3–9, and a row of "0 / 0" is noise on a phone.
    const character = makeCharacter({ level: 3, hpRolls: [6, 4, 4] });
    const context = makeContext({ slotsByLevel: { 1: 4, 2: 2 } });

    expect(derive(character, context).spellSlots).toEqual([
      { level: 1, total: 4, expended: 0, remaining: 4 },
      { level: 2, total: 2, expended: 0, remaining: 2 },
    ]);
  });

  it("subtracts the expended slots the record stores", () => {
    const base = makeCharacter();
    const character = makeCharacter({
      level: 3,
      hpRolls: [6, 4, 4],
      play: { ...base.play, slotsExpended: { ...base.play.slotsExpended, 1: 3 } },
    });

    const [first] = derive(character, makeContext({ slotsByLevel: { 1: 4, 2: 2 } })).spellSlots;

    expect(first).toEqual({ level: 1, total: 4, expended: 3, remaining: 1 });
  });

  it("never reports a negative remainder", () => {
    // A slot table that shrank — a level-down, or a re-seed — must not render
    // "-1 left".
    const base = makeCharacter();
    const character = makeCharacter({
      play: { ...base.play, slotsExpended: { ...base.play.slotsExpended, 1: 5 } },
    });

    expect(derive(character, makeContext({ slotsByLevel: { 1: 2 } })).spellSlots[0].remaining).toBe(0);
  });

  it("orders the levels ascending", () => {
    const context = makeContext({ slotsByLevel: { 3: 2, 1: 4, 2: 3 } });

    expect(derive(makeCharacter(), context).spellSlots.map((slot) => slot.level)).toEqual([1, 2, 3]);
  });

  it("carries the cantrips the class knows", () => {
    // Cantrips are not slots — they are cast at will — so they are a separate
    // number, never a row in the slot table.
    expect(derive(makeCharacter(), makeContext({ cantripsKnown: 3 })).cantripsKnown).toBe(3);
  });

  it("has no cantrips for a non-caster", () => {
    expect(derive(makeCharacter(), EMPTY_CONTEXT).cantripsKnown).toBe(0);
  });
});
