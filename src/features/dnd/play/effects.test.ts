import { describe, expect, it } from "vitest";
import type { Modifier } from "@/features/dnd/db/schema";
import { makeCharacter, makeModifier } from "@/features/dnd/derive/fixtures";
import { CONDITIONS, conditionRef, isConditionRef } from "@/features/dnd/play/conditions";
import {
  activeConditions,
  activeEffects,
  activeOverrides,
  clearOverride,
  describeModifier,
  effectGroups,
  toggleCondition,
  toggleEffect,
} from "@/features/dnd/play/effects";

/**
 * The effects row shows only ACTIVE things, in two visual languages that must
 * never merge: amber effects change numbers, rose conditions are reminders
 * only. See CONTEXT.md § Condition and the prototype decision on #150.
 */

const RAGING = makeModifier({
  id: "feature:rage",
  source: "feature:rage",
  target: "ac",
  op: "add",
  value: 2,
  enabled: true,
  label: "Raging",
});

const UNARMORED = makeModifier({
  id: "feature:unarmored-defense",
  source: "feature:unarmored-defense",
  target: "ac",
  op: "add",
  value: 3,
  enabled: false,
  label: "Unarmored Defense",
});

function withModifiers(modifiers: Modifier[]) {
  return makeCharacter({ modifiers });
}

const RACIAL = makeModifier({
  id: "race:catalog:dwarf:ability.con",
  source: "race:catalog:dwarf",
  target: "ability.con",
  op: "add",
  value: 2,
  enabled: true,
  label: "Dwarf +2 CON",
});

const EQUIPPED = makeModifier({
  id: "equip:shield",
  source: "equip:shield",
  target: "ac",
  op: "add",
  value: 2,
  enabled: true,
  label: "Shield",
});

describe("what counts as an effect", () => {
  it("excludes racial bonuses — a racial ASI is character data, not a switch", () => {
    // The play surface never exposes character data. A pill offering to turn a
    // Dwarf's +2 CON off would be exactly the accidental edit the whole
    // separation exists to prevent.
    expect(activeEffects(withModifiers([RACIAL, RAGING])).map((one) => one.label)).toEqual(["Raging"]);
  });

  it("excludes equipment — that is driven by equipping, not by a toggle", () => {
    expect(activeEffects(withModifiers([EQUIPPED, RAGING])).map((one) => one.label)).toEqual(["Raging"]);
  });

  it("keeps them out of the drawer too, so there is no switch anywhere", () => {
    expect(effectGroups(withModifiers([RACIAL, EQUIPPED])).effects).toEqual([]);
  });

  it("includes homebrew, which is player-authored and therefore player-toggled", () => {
    const homebrew = makeModifier({
      id: "homebrew:blessing",
      source: "homebrew:blessing",
      target: "ac",
      op: "add",
      value: 1,
      enabled: true,
      label: "Blessing",
    });

    expect(activeEffects(withModifiers([homebrew])).map((one) => one.label)).toEqual(["Blessing"]);
  });

  it("includes items, which a player picks up and puts down", () => {
    const item = makeModifier({
      id: "item:cloak",
      source: "item:cloak-of-protection",
      target: "ac",
      op: "add",
      value: 1,
      enabled: true,
      label: "Cloak of Protection",
    });

    expect(activeEffects(withModifiers([item])).map((one) => one.label)).toEqual(["Cloak of Protection"]);
  });
});

describe("activeEffects", () => {
  it("returns only enabled modifiers", () => {
    const character = withModifiers([RAGING, UNARMORED]);

    expect(activeEffects(character).map((one) => one.label)).toEqual(["Raging"]);
  });

  it("is empty when nothing is toggled on", () => {
    expect(activeEffects(withModifiers([UNARMORED]))).toEqual([]);
  });

  it("omits overrides — an override is a value, not an effect to display as a pill", () => {
    const override = makeModifier({ source: "override", target: "speed", op: "set", value: 20, label: "Speed" });

    expect(activeEffects(withModifiers([override, RAGING])).map((one) => one.label)).toEqual(["Raging"]);
  });
});

describe("toggleEffect", () => {
  it("flips one modifier's enabled flag and leaves the rest alone", () => {
    const next = toggleEffect([RAGING, UNARMORED], "feature:unarmored-defense");

    expect(next.find((one) => one.id === "feature:unarmored-defense")?.enabled).toBe(true);
    expect(next.find((one) => one.id === "feature:rage")?.enabled).toBe(true);
  });

  it("flips an enabled modifier off", () => {
    const next = toggleEffect([RAGING], "feature:rage");

    expect(next[0].enabled).toBe(false);
  });

  it("returns an unchanged list for an id that is not there", () => {
    expect(toggleEffect([RAGING], "feature:nothing")).toEqual([RAGING]);
  });

  it("does not mutate the list it was given", () => {
    const modifiers = [RAGING];
    toggleEffect(modifiers, "feature:rage");

    expect(modifiers[0].enabled).toBe(true);
  });
});

describe("effectGroups", () => {
  it("splits effects from conditions — the two the drawer labels separately", () => {
    const character = makeCharacter({
      modifiers: [RAGING, UNARMORED],
      play: { ...makeCharacter().play, conditions: [conditionRef("prone")] },
    });

    const groups = effectGroups(character);

    expect(groups.effects.map((one) => one.label)).toEqual(["Raging", "Unarmored Defense"]);
    expect(groups.conditions.filter((one) => one.active).map((one) => one.name)).toEqual(["Prone"]);
  });

  it("lists every SRD condition, marking only the ones the character has", () => {
    const character = makeCharacter({
      play: { ...makeCharacter().play, conditions: [conditionRef("poisoned")] },
    });

    const groups = effectGroups(character);

    expect(groups.conditions).toHaveLength(CONDITIONS.length);
    expect(groups.conditions.filter((one) => one.active).map((one) => one.index)).toEqual(["poisoned"]);
  });

  it("lists every modifier, active or not, so the drawer can toggle them back on", () => {
    const groups = effectGroups(withModifiers([RAGING, UNARMORED]));

    expect(groups.effects).toHaveLength(2);
    expect(groups.effects.filter((one) => one.enabled)).toHaveLength(1);
  });

  it("keeps overrides out of the effects group as well", () => {
    const override = makeModifier({ source: "override", target: "ac", op: "set", value: 20, label: "AC" });

    expect(effectGroups(withModifiers([override])).effects).toEqual([]);
  });
});

describe("conditions", () => {
  it("carries the 15 SRD conditions", () => {
    expect(CONDITIONS).toHaveLength(15);
  });

  it("names them as the SRD does", () => {
    expect(CONDITIONS.map((one) => one.index)).toContain("unconscious");
    expect(CONDITIONS.find((one) => one.index === "prone")?.name).toBe("Prone");
  });

  it("gives each a description, because a reminder with no text reminds you of nothing", () => {
    for (const condition of CONDITIONS) {
      expect(condition.description.length).toBeGreaterThan(0);
    }
  });

  it("round-trips a ref", () => {
    expect(isConditionRef(conditionRef("prone"))).toBe(true);
  });

  it("rejects a ref that is not a condition", () => {
    expect(isConditionRef("catalog:human")).toBe(false);
    expect(isConditionRef("prone")).toBe(false);
  });
});

describe("activeConditions", () => {
  it("resolves the character's stored refs to conditions", () => {
    const character = makeCharacter({
      play: { ...makeCharacter().play, conditions: [conditionRef("prone"), conditionRef("poisoned")] },
    });

    expect(activeConditions(character).map((one) => one.name)).toEqual(["Prone", "Poisoned"]);
  });

  it("drops a ref that names no condition rather than rendering a blank pill", () => {
    const character = makeCharacter({
      play: { ...makeCharacter().play, conditions: [conditionRef("prone"), "catalog:sleepy"] },
    });

    expect(activeConditions(character).map((one) => one.name)).toEqual(["Prone"]);
  });
});

describe("toggleCondition", () => {
  it("adds one that is absent", () => {
    expect(toggleCondition([], "prone")).toEqual([conditionRef("prone")]);
  });

  it("removes one that is present", () => {
    expect(toggleCondition([conditionRef("prone")], "prone")).toEqual([]);
  });

  it("leaves the others in place", () => {
    const next = toggleCondition([conditionRef("prone"), conditionRef("poisoned")], "prone");

    expect(next).toEqual([conditionRef("poisoned")]);
  });

  it("does not mutate the list it was given", () => {
    const refs = [conditionRef("prone")];
    toggleCondition(refs, "poisoned");

    expect(refs).toEqual([conditionRef("prone")]);
  });
});

describe("overrides", () => {
  const speedOverride = makeModifier({
    id: "override-speed",
    source: "override",
    target: "speed",
    op: "set",
    value: 20,
    label: "Speed",
  });

  it("keys the overrides in force by the target each replaces", () => {
    const character = withModifiers([speedOverride, RAGING]);

    expect([...activeOverrides(character).keys()]).toEqual(["speed"]);
  });

  it("takes the last override on a target — a second one is a change of mind", () => {
    const second = makeModifier({
      id: "override-speed-2",
      source: "override",
      target: "speed",
      op: "set",
      value: 45,
      label: "Speed",
    });

    expect(activeOverrides(withModifiers([speedOverride, second])).get("speed")?.value).toBe(45);
  });

  it("ignores a disabled override", () => {
    const disabled = { ...speedOverride, enabled: false };

    expect(activeOverrides(withModifiers([disabled])).size).toBe(0);
  });

  it("clears an override by deleting the record, leaving other modifiers alone", () => {
    const next = clearOverride([speedOverride, RAGING], "speed");

    expect(next).toEqual([RAGING]);
  });

  it("clears only the named target", () => {
    const acOverride = makeModifier({
      id: "override-ac",
      source: "override",
      target: "ac",
      op: "set",
      value: 20,
      label: "AC",
    });

    expect(clearOverride([speedOverride, acOverride], "speed")).toEqual([acOverride]);
  });
});

describe("describeModifier", () => {
  it("names a target the way the sheet does, not the way it is stored", () => {
    expect(describeModifier(makeModifier({ target: "ability.con", op: "add", value: 2 }))).toBe("CON +2");
    expect(describeModifier(makeModifier({ target: "ac", op: "add", value: 2 }))).toBe("AC +2");
    expect(describeModifier(makeModifier({ target: "save.dex", op: "add", value: 1 }))).toBe("DEX save +1");
    expect(describeModifier(makeModifier({ target: "spell.saveDc", op: "add", value: 1 }))).toBe("Spell save DC +1");
  });

  it("title-cases a hyphenated skill", () => {
    expect(describeModifier(makeModifier({ target: "skill.animal-handling", op: "add", value: 2 }))).toBe(
      "Animal Handling +2",
    );
  });

  it("keeps the sign on a penalty rather than printing +-2", () => {
    expect(describeModifier(makeModifier({ target: "speed", op: "add", value: -10 }))).toBe("Speed -10");
  });

  it("reads each op in the words the SRD uses for it", () => {
    expect(describeModifier(makeModifier({ target: "ac", op: "set", value: 15 }))).toBe("AC set to 15");
    expect(describeModifier(makeModifier({ target: "ac", op: "min", value: 12 }))).toBe("AC at least 12");
    expect(describeModifier(makeModifier({ target: "ac", op: "max", value: 20 }))).toBe("AC at most 20");
  });

  it("names a reference rather than printing an object", () => {
    expect(describeModifier(makeModifier({ target: "ac", op: "add", value: { ref: "mod.dex" } }))).toBe(
      "AC +your mod.dex",
    );
  });

  it("falls back to the raw target rather than to a blank label", () => {
    expect(describeModifier(makeModifier({ target: "attack.longsword.hit", op: "add", value: 1 }))).toBe(
      "attack.longsword.hit +1",
    );
  });
});
