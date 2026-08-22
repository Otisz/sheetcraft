/**
 * The projections behind the Spells, Features and Bio tabs. Pure, and tested
 * apart from the components, like the rest of `play/` — the interesting
 * decisions here are about what a tab says when it has nothing to show, and
 * that is exactly what a component test would bury.
 */
import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "@/features/dnd/db/schema";
import { makeCharacter } from "@/features/dnd/derive/fixtures";
import { describeCharacter, groupProficiencies, spellSection } from "@/features/dnd/play/sections";

/** A character carrying the given proficiency refs, over the neutral fixture. */
function withProficiencies(patch: Partial<CharacterRecord["proficiencies"]>): CharacterRecord {
  const base = makeCharacter();
  return makeCharacter({ proficiencies: { ...base.proficiencies, ...patch } });
}

describe("the spell section", () => {
  it("is present for a non-caster", () => {
    // The section is always rendered — some classes gain cantrips from a
    // subclass, so an absent section would be undiscoverable. See #164.
    const section = spellSection({ className: "Barbarian", slots: [], cantripsKnown: 0, known: [], prepared: [] });

    expect(section.empty).toBe(true);
  });

  it("names the class in the empty message rather than saying 'no spells'", () => {
    // "Barbarian grants none" answers the question the player is actually
    // asking, which is whether the app lost their spells.
    const section = spellSection({ className: "Barbarian", slots: [], cantripsKnown: 0, known: [], prepared: [] });

    expect(section.emptyMessage).toBe("No spells or cantrips — Barbarian grants none.");
  });

  it("falls back to a class-less phrasing when the class ref does not resolve", () => {
    const section = spellSection({ className: null, slots: [], cantripsKnown: 0, known: [], prepared: [] });

    expect(section.emptyMessage).toBe("No spells or cantrips — this class grants none.");
  });

  it("is not empty for a caster with slots but no spells chosen yet", () => {
    // Slots alone are spellcasting: the player has somewhere to put a spell,
    // and telling them their class grants none would be false.
    const section = spellSection({
      className: "Wizard",
      slots: [{ level: 1, total: 2, expended: 0, remaining: 2 }],
      cantripsKnown: 0,
      known: [],
      prepared: [],
    });

    expect(section.empty).toBe(false);
  });

  it("is not empty for a caster who only knows cantrips", () => {
    // A level 1 warlock has cantrips and one slot; a subclass caster can have
    // cantrips and no slots at all. Either is spellcasting.
    const section = spellSection({ className: "Wizard", slots: [], cantripsKnown: 2, known: [], prepared: [] });

    expect(section.empty).toBe(false);
  });

  it("marks the spells that are prepared", () => {
    const section = spellSection({
      className: "Wizard",
      slots: [],
      cantripsKnown: 0,
      known: ["catalog:magic-missile", "catalog:shield"],
      prepared: ["catalog:shield"],
    });

    expect(section.spells).toEqual([
      { ref: "catalog:magic-missile", index: "magic-missile", prepared: false },
      { ref: "catalog:shield", index: "shield", prepared: true },
    ]);
  });

  it("includes a prepared spell that is not in the known list", () => {
    // A cleric prepares from the whole class list rather than from a known
    // list, so `prepared` is not a subset of `known`. Dropping it would hide a
    // spell the player prepared.
    const section = spellSection({
      className: "Cleric",
      slots: [],
      cantripsKnown: 0,
      known: [],
      prepared: ["catalog:bless"],
    });

    expect(section.spells).toEqual([{ ref: "catalog:bless", index: "bless", prepared: true }]);
  });

  it("lists a spell once even when it is both known and prepared", () => {
    const section = spellSection({
      className: "Wizard",
      slots: [],
      cantripsKnown: 0,
      known: ["catalog:shield"],
      prepared: ["catalog:shield"],
    });

    expect(section.spells).toHaveLength(1);
  });
});

describe("proficiencies by kind", () => {
  it("groups the five ref-carrying kinds", () => {
    // Saves are not here: they are abilities, not refs, and the Skills tab
    // shows them beside the saves they modify.
    expect(groupProficiencies(makeCharacter()).map((group) => group.kind)).toEqual([
      "armor",
      "weapons",
      "tools",
      "languages",
      "skills",
    ]);
  });

  it("carries the entries of each kind", () => {
    const character = withProficiencies({ tools: ["catalog:thieves-tools", "catalog:lute"] });

    const tools = groupProficiencies(character).find((group) => group.kind === "tools");

    expect(tools?.entries).toEqual([
      { ref: "catalog:thieves-tools", index: "thieves-tools" },
      { ref: "catalog:lute", index: "lute" },
    ]);
  });

  it("keeps an empty kind as a labelled group rather than dropping it", () => {
    // "Tools: none" is information. A missing heading is a question.
    const groups = groupProficiencies(makeCharacter());

    expect(groups.every((group) => group.entries.length === 0)).toBe(true);
    expect(groups).toHaveLength(5);
  });

  it("labels each kind for display", () => {
    expect(groupProficiencies(makeCharacter()).map((group) => group.label)).toEqual([
      "Armor",
      "Weapons",
      "Tools",
      "Languages",
      "Skills",
    ]);
  });

  it("drops a malformed ref rather than rendering a broken row", () => {
    const character = withProficiencies({ languages: ["common" as never, "catalog:elvish"] });

    const languages = groupProficiencies(character).find((group) => group.kind === "languages");

    expect(languages?.entries).toEqual([{ ref: "catalog:elvish", index: "elvish" }]);
  });
});

describe("the character descriptor", () => {
  const NAMES = {
    "catalog:barbarian": "Barbarian",
    "catalog:berserker": "Path of the Berserker",
    "catalog:dwarf": "Dwarf",
    "catalog:hill-dwarf": "Hill Dwarf",
  };

  it("reads level, race and class", () => {
    const character = makeCharacter({ level: 3, classRef: "catalog:barbarian", raceRef: "catalog:dwarf" });

    expect(describeCharacter(character, NAMES)).toBe("Level 3 Dwarf Barbarian");
  });

  it("qualifies the race with its subrace and the class with its subclass", () => {
    const character = makeCharacter({
      level: 3,
      classRef: "catalog:barbarian",
      subclassRef: "catalog:berserker",
      raceRef: "catalog:dwarf",
      subraceRef: "catalog:hill-dwarf",
    });

    expect(describeCharacter(character, NAMES)).toBe("Level 3 Dwarf (Hill Dwarf) Barbarian (Path of the Berserker)");
  });

  it("falls back to the level alone before the names have resolved", () => {
    // The line renders on first paint, before `useTabData` returns. A ⚠ marker
    // that vanishes a moment later is noise on the one line read at a glance.
    const character = makeCharacter({ level: 3, classRef: "catalog:barbarian", raceRef: "catalog:dwarf" });

    expect(describeCharacter(character, {})).toBe("Level 3");
  });

  it("drops a subtype whose name has not resolved rather than the type with it", () => {
    const character = makeCharacter({
      level: 3,
      classRef: "catalog:barbarian",
      subclassRef: "catalog:no-such-subclass",
      raceRef: "catalog:dwarf",
    });

    expect(describeCharacter(character, NAMES)).toBe("Level 3 Dwarf Barbarian");
  });
});
