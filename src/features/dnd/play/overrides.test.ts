import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ABILITIES } from "@/features/dnd/db/schema";
import { DERIVED_TARGETS, SKILLS, type Skill } from "@/features/dnd/derive";
import { makeModifier } from "@/features/dnd/derive/fixtures";
import { clearOverride } from "@/features/dnd/play/effects";
import {
  derivedValueFor,
  HEADER_MARKER_RENDERERS,
  isOverridable,
  MARKER_RENDERERS,
  OVERRIDE_SURFACES,
  OVERRIDE_TARGETS,
  overrideFor,
  overrideSurface,
  setOverride,
  targetsForSurface,
} from "@/features/dnd/play/overrides";

/**
 * Creating an override — the half of the mechanism that did not exist until
 * #171. Resolution, validation, the marker and clearing all predate this; what
 * is tested here is the write, and the map from target to the surface that
 * offers it. See ADR-0005.
 */

const EXISTING = makeModifier({
  id: "override:ac",
  source: "override",
  target: "ac",
  op: "set",
  value: 17,
  enabled: true,
  label: "AC set to 17",
});

const RAGING = makeModifier({
  id: "feature:rage:ac",
  source: "feature:rage",
  target: "ac",
  op: "add",
  value: 2,
  enabled: true,
  label: "Raging",
});

describe("setOverride", () => {
  it("writes a set override the resolver will short-circuit on", () => {
    const [override] = setOverride([], "ac", 17);

    expect(override).toMatchObject({ source: "override", target: "ac", op: "set", value: 17, enabled: true });
  });

  it("derives the id from source and target, so the same write is the same record", () => {
    const [first] = setOverride([], "skill.stealth", 9);
    const [second] = setOverride([], "skill.stealth", 9);

    expect(first.id).toBe(second.id);
    expect(first.id).toBe("override:skill.stealth");
  });

  it("labels the record in the sheet's own words, so the effects row can read it back", () => {
    const [override] = setOverride([], "spell.saveDc", 15);

    expect(override.label).toBe("Spell save DC set to 15");
  });

  it("replaces an existing override on the same target rather than stacking", () => {
    const modifiers = setOverride([EXISTING], "ac", 20);

    expect(modifiers.filter((one) => one.target === "ac" && one.source === "override")).toHaveLength(1);
    expect(modifiers[0]).toMatchObject({ target: "ac", value: 20 });
  });

  it("leaves every non-override record untouched, including on the same target", () => {
    const modifiers = setOverride([RAGING, EXISTING], "ac", 20);

    expect(modifiers).toContainEqual(RAGING);
  });

  it("keeps an override on a different target", () => {
    const modifiers = setOverride([EXISTING], "speed", 20);

    expect(modifiers.filter((one) => one.source === "override")).toHaveLength(2);
  });

  it("round-trips with clearOverride, which is the only way an override ends", () => {
    expect(clearOverride(setOverride([], "initiative", 5), "initiative")).toEqual([]);
  });

  it("refuses a non-finite value rather than storing a number the sheet cannot show", () => {
    expect(() => setOverride([], "ac", Number.NaN)).toThrow(/finite/i);
    expect(() => setOverride([], "ac", Number.POSITIVE_INFINITY)).toThrow(/finite/i);
  });

  it("refuses a target outside the closed vocabulary, the way a modifier record is validated", () => {
    expect(() => setOverride([], "ac.bogus", 1)).toThrow(/ac\.bogus/);
  });

  it("refuses an attack target, which has no creation surface to be seen on", () => {
    // Overridable by the vocabulary, but the weapon id is not knowable up
    // front, so no surface enumerates it and no marker would render.
    expect(() => setOverride([], "attack.longsword.hit", 7)).toThrow(/attack/i);
  });
});

describe("overrideFor", () => {
  it("finds the override in force on a target", () => {
    expect(overrideFor([EXISTING], "ac")).toBe(EXISTING);
  });

  it("is undefined when only a non-override record touches the target", () => {
    expect(overrideFor([RAGING], "ac")).toBeUndefined();
  });

  it("takes the last of several, matching resolution's last-wins", () => {
    const first = { ...EXISTING, value: 11 };
    const second = { ...EXISTING, value: 22 };

    expect(overrideFor([first, second], "ac")).toBe(second);
  });
});

/**
 * The coverage claim ADR-0005 rests on: every overridable target is claimed by
 * exactly one surface, so a value cannot gain a way to be set without gaining
 * a way to be seen.
 */
describe("the surface map", () => {
  it("covers every enumerable derived target", () => {
    expect([...OVERRIDE_TARGETS].sort()).toEqual([...DERIVED_TARGETS].sort());
  });

  it("claims all 38 of them", () => {
    expect(OVERRIDE_TARGETS).toHaveLength(38);
  });

  it("gives every target exactly one surface", () => {
    for (const target of OVERRIDE_TARGETS) {
      expect(OVERRIDE_SURFACES).toContain(overrideSurface(target));
    }
  });

  it("partitions the targets — every surface's list is disjoint and together they are the whole", () => {
    const claimed = OVERRIDE_SURFACES.flatMap((surface) => targetsForSurface(surface));

    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed.sort()).toEqual([...OVERRIDE_TARGETS].sort());
  });

  it("puts the ten header-only values in the drawer, and nothing else", () => {
    expect(targetsForSurface("menu").sort()).toEqual(
      ["ac", "initiative", "speed", "proficiencyBonus", ...ABILITIES.map((abil) => `ability.${abil}`)].sort(),
    );
  });

  it("puts maxHp on the Combat tab, which renders it beside the rolls behind it", () => {
    expect(overrideSurface("maxHp")).toBe("combat");
  });

  it("puts the saves, skills and passive Perception on the Skills tab", () => {
    expect(overrideSurface("save.str")).toBe("skills");
    expect(overrideSurface("skill.stealth")).toBe("skills");
    expect(overrideSurface("passivePerception")).toBe("skills");
  });

  it("puts both spellcasting stats on the Spells tab", () => {
    expect(overrideSurface("spell.saveDc")).toBe("spells");
    expect(overrideSurface("spell.attack")).toBe("spells");
  });

  it("recognises an overridable target and rejects anything else", () => {
    expect(isOverridable("skill.stealth")).toBe(true);
    expect(isOverridable("attack.longsword.hit")).toBe(false);
    expect(isOverridable("nonsense")).toBe(false);
  });
});

/**
 * The drawer and the tabs both need "what does this target currently derive
 * to?" — the number the editor pre-fills and the one clearing returns to.
 */
describe("derivedValueFor", () => {
  const derived = {
    abilityScores: { str: 16, dex: 14, con: 13, int: 8, wis: 12, cha: 10 },
    abilityModifiers: { str: 3, dex: 2, con: 1, int: -1, wis: 1, cha: 0 },
    proficiencyBonus: 2,
    maxHp: 12,
    armorClass: 17,
    initiative: 2,
    speed: 25,
    // Every skill, not just the one asserted below: the coverage test at the
    // foot of this block asserts a finite value for all 38 targets, and a
    // partial fixture would make it pass by testing nothing.
    skills: Object.fromEntries((Object.keys(SKILLS) as Skill[]).map((skill) => [skill, skill === "stealth" ? 4 : 0])),
    saves: { str: 5, dex: 2, con: 1, int: -1, wis: 1, cha: 0 },
    passivePerception: 11,
    spellSaveDc: null,
    spellAttackBonus: null,
  } as unknown as Parameters<typeof derivedValueFor>[0];

  it("reads the scalars, including the two the engine names differently", () => {
    // `ac` is `armorClass` on the derived object, and `spell.saveDc` is
    // `spellSaveDc` — the target vocabulary and the field names are not the
    // same spelling, which is the whole reason this function exists.
    expect(derivedValueFor(derived, "ac")).toBe(17);
    expect(derivedValueFor(derived, "maxHp")).toBe(12);
    expect(derivedValueFor(derived, "initiative")).toBe(2);
    expect(derivedValueFor(derived, "speed")).toBe(25);
    expect(derivedValueFor(derived, "proficiencyBonus")).toBe(2);
    expect(derivedValueFor(derived, "passivePerception")).toBe(11);
  });

  it("reads an ability as its SCORE, which is what an ability target addresses", () => {
    // `ability.str` moves the score; the modifier follows from it. Pre-filling
    // the editor with the modifier would have the player overwrite a 16 with a 3.
    expect(derivedValueFor(derived, "ability.str")).toBe(16);
  });

  it("reads saves and skills", () => {
    expect(derivedValueFor(derived, "save.str")).toBe(5);
    expect(derivedValueFor(derived, "skill.stealth")).toBe(4);
  });

  it("reports a non-caster's spell stats as 0 rather than null", () => {
    // An override needs a number to start from, and 0 is what the sheet is
    // currently claiming — which is nothing.
    expect(derivedValueFor(derived, "spell.saveDc")).toBe(0);
    expect(derivedValueFor(derived, "spell.attack")).toBe(0);
  });

  it("covers every overridable target, so no surface can open an editor on undefined", () => {
    for (const target of OVERRIDE_TARGETS) {
      expect(Number.isFinite(derivedValueFor(derived, target))).toBe(true);
    }
  });
});

/**
 * **Marker coverage follows creation coverage exactly.** The ticket's hardest
 * criterion, and the one worth a source-reading test rather than a convention:
 * an override the player can create but cannot see leaves the sheet showing a
 * hand-set number with nothing saying so.
 *
 * Reading the files is the point. A map naming a component nobody wrote would
 * satisfy a structural assertion exactly as a bare surface name would — which
 * is the bug `tabs.test.ts` was rewritten to catch, on the same shape of map.
 */
describe("marker coverage", () => {
  /** The components live beside this test; `import.meta.url` keeps that literal. */
  const PLAY_DIR = dirname(fileURLToPath(import.meta.url));

  function read(file: string): string {
    return readFileSync(join(PLAY_DIR, file), "utf8");
  }

  function componentsIn(source: string): Set<string> {
    return new Set([...source.matchAll(/(?:export\s+)?function\s+([A-Z]\w*)/g)].map((match) => match[1]));
  }

  /**
   * Source with comments removed.
   *
   * Load-bearing, and learned from this test's own first version: it matched
   * `/overridden/` against the whole file, and every one of these files
   * *documents* the marker in a docblock. Both real markers could be deleted
   * from the play header and the assertion still passed — the exact "map entry
   * with no pixels behind it" failure this block exists to catch, reproduced
   * inside the thing meant to catch it.
   */
  function code(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  }

  /** One component's body, so an assertion cannot be satisfied from elsewhere in the file. */
  function bodyOf(source: string, component: string): string {
    const start = source.indexOf(`function ${component}`);
    expect(start).toBeGreaterThanOrEqual(0);
    return code(source.slice(start));
  }

  it("names a marker renderer for every surface a player can create from", () => {
    expect(Object.keys(MARKER_RENDERERS).sort()).toEqual([...OVERRIDE_SURFACES].sort());
  });

  it.each(Object.entries(MARKER_RENDERERS))("%s renders its markers in a component that exists", (_surface, home) => {
    const defined = componentsIn(read(home.file));

    for (const component of home.components) {
      expect(defined).toContain(component);
    }
  });

  it.each(Object.entries(MARKER_RENDERERS))("%s actually renders the marker, in code", (_surface, home) => {
    // Comments stripped, and scoped to each named component's own body: a
    // docblock explaining the marker is not a marker, and a marker elsewhere in
    // the file is not this component's.
    for (const component of home.components) {
      const body = bodyOf(read(home.file), component);

      // Either the shared component or the caption it renders — a surface that
      // spells the caption by hand is still marking the value.
      expect(/OverrideMarker|overridden/.test(body)).toBe(true);
    }
  });

  it("marks the header too, where the drawer's ten values are actually read", () => {
    const source = read(HEADER_MARKER_RENDERERS.file);
    const defined = componentsIn(source);

    for (const component of HEADER_MARKER_RENDERERS.components) {
      expect(defined).toContain(component);
      expect(/OverrideMarker|overridden/.test(bodyOf(source, component))).toBe(true);
    }
  });

  it("marks the ability grid, which gained no tap but did gain a way to be set", () => {
    // The six abilities are settable only from the ⋯ drawer, so it would be
    // easy to mark the drawer and forget the grid the player actually reads.
    expect(bodyOf(read(HEADER_MARKER_RENDERERS.file), "Abilities")).toMatch(/overrideFor\(/);
  });

  it("leaves every overridable target with a surface whose marker is checked", () => {
    for (const target of OVERRIDE_TARGETS) {
      const surface = overrideSurface(target);

      expect(surface).toBeDefined();
      expect(MARKER_RENDERERS[surface as keyof typeof MARKER_RENDERERS]).toBeDefined();
    }
  });
});
