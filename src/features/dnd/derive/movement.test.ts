import { describe, expect, it } from "vitest";
import { derive } from "@/features/dnd/derive/derive";
import { abilities, makeCharacter, makeContext, makeModifier } from "@/features/dnd/derive/fixtures";

/**
 * Initiative and speed — the other two thirds of the play screen's key-stats
 * row. Expected values transcribed from the rulebook, never computed by the
 * engine under test. See ADR-0002 § Fixtures.
 */

describe("initiative", () => {
  // PHB p.189: "you make a Dexterity check ... your initiative". No proficiency
  // bonus — initiative is a raw ability check.
  it.each([
    [10, 0],
    [14, 2],
    [18, 4],
    [7, -2],
    [20, 5],
  ])("dex %i gives initiative %i", (dex, expected) => {
    const character = makeCharacter({ abilities: abilities({ dex }) });

    expect(derive(character, makeContext()).initiative).toBe(expected);
  });

  it("does not add the proficiency bonus, even at a level where it is +6", () => {
    const character = makeCharacter({ level: 20, abilities: abilities({ dex: 14 }) });

    expect(derive(character, makeContext()).initiative).toBe(2);
  });

  it("tracks a modifier that moved DEX, because it reads the derived score", () => {
    const character = makeCharacter({
      abilities: abilities({ dex: 14 }),
      modifiers: [makeModifier({ target: "ability.dex", op: "add", value: 2, label: "Gauntlets" })],
    });

    // DEX 16 → +3, not the +2 the base score alone would give.
    expect(derive(character, makeContext()).initiative).toBe(3);
  });

  it("takes an `initiative` modifier on top — Alert is +5 (PHB p.165)", () => {
    const character = makeCharacter({
      abilities: abilities({ dex: 14 }),
      modifiers: [makeModifier({ target: "initiative", op: "add", value: 5, label: "Alert" })],
    });

    expect(derive(character, makeContext()).initiative).toBe(7);
  });

  it("is overridable, and the override wins outright", () => {
    const character = makeCharacter({
      abilities: abilities({ dex: 14 }),
      modifiers: [makeModifier({ target: "initiative", source: "override", op: "set", value: 9 })],
    });

    expect(derive(character, makeContext()).initiative).toBe(9);
  });

  it("explains itself", () => {
    const character = makeCharacter({
      abilities: abilities({ dex: 14 }),
      modifiers: [makeModifier({ target: "initiative", op: "add", value: 5, label: "Alert" })],
    });

    const trace = derive(character, makeContext()).explain("initiative");

    expect(trace.base).toBe(2);
    expect(trace.value).toBe(7);
    expect(trace.steps.map((step) => step.label)).toEqual(["Alert"]);
  });
});

describe("speed", () => {
  // Transcribed from the vendored SRD race entries.
  it.each([
    ["human", 30],
    ["dwarf", 25],
    ["halfling", 25],
    ["elf", 30],
  ])("%s walks %i feet", (_race, speed) => {
    const character = makeCharacter();

    expect(derive(character, makeContext({ speed })).speed).toBe(speed);
  });

  it("takes a modifier — the Barbarian's Fast Movement is +10 (PHB p.48)", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ target: "speed", op: "add", value: 10, label: "Fast Movement" })],
    });

    expect(derive(character, makeContext({ speed: 30 })).speed).toBe(40);
  });

  it("is overridable, which is the case the prototype's override marker showed", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ target: "speed", source: "override", op: "set", value: 15 })],
    });

    expect(derive(character, makeContext({ speed: 30 })).speed).toBe(15);
  });

  it("floors at 0 rather than going negative — a speed below 0 is not a distance", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ target: "speed", op: "add", value: -40, label: "Heavily encumbered" })],
    });

    expect(derive(character, makeContext({ speed: 30 })).speed).toBe(0);
  });

  it("records the floor as a step, so the trace still sums to the value", () => {
    const character = makeCharacter({
      modifiers: [makeModifier({ target: "speed", op: "add", value: -40, label: "Heavily encumbered" })],
    });

    const trace = derive(character, makeContext({ speed: 30 })).explain("speed");

    expect(trace.value).toBe(0);
    expect(trace.steps.at(-1)?.value).toBe(0);
  });

  it("defaults to 30 when the context carries no speed — an unresolvable race falls back to base", () => {
    const character = makeCharacter();

    expect(derive(character, makeContext()).speed).toBe(30);
  });
});
