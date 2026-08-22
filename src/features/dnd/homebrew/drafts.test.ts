import { describe, expect, it } from "vitest";
import { buildCandidate, draftFromEntry, emptyFormDraft, type FormDraft } from "@/features/dnd/homebrew/drafts";
import { validateEntry } from "@/features/dnd/homebrew/validate";

/**
 * The contract these tests hold the drafts to: a draft with its REQUIRED
 * fields filled must build something the vendored schema accepts. A form that
 * can only produce invalid entries is a form that cannot be used at all, and
 * the schema is the only judge of that.
 */

describe("emptyFormDraft", () => {
  it.each(["races", "subraces", "equipment", "spells", "subclasses"] as const)(
    "starts %s blank rather than pre-filled",
    (type) => {
      expect(emptyFormDraft(type).name).toBe("");
    },
  );
});

describe("buildCandidate — races", () => {
  const filled: FormDraft = { ...emptyFormDraft("races"), name: "Azureborn", speed: "30", size: "Medium" };

  it("builds an entry its schema accepts", () => {
    expect(validateEntry("races", { ...buildCandidate("races", filled), index: "azureborn" }).ok).toBe(true);
  });

  it("carries the speed through as a number, not the typed string", () => {
    expect(buildCandidate("races", filled).speed).toBe(30);
  });

  it("treats a blank speed as 0 rather than as NaN", () => {
    expect(buildCandidate("races", { ...filled, speed: "" }).speed).toBe(0);
  });

  it("turns the ability bonus rows into the schema's shape", () => {
    const draft = { ...filled, abilityBonuses: { str: "2", dex: "", con: "1", int: "", wis: "", cha: "" } };

    expect(buildCandidate("races", draft).ability_bonuses).toEqual([
      { ability_score: { index: "str", name: "STR", url: "/api/ability-scores/str" }, bonus: 2 },
      { ability_score: { index: "con", name: "CON", url: "/api/ability-scores/con" }, bonus: 1 },
    ]);
  });

  it("drops a zero bonus, which is a row the author left alone", () => {
    const draft = { ...filled, abilityBonuses: { str: "0", dex: "", con: "", int: "", wis: "", cha: "" } };

    expect(buildCandidate("races", draft).ability_bonuses).toEqual([]);
  });

  it("splits languages on commas and trims them", () => {
    const draft = { ...filled, languages: "Common, Azure ,  Dwarvish" };

    expect(buildCandidate("races", draft).languages).toMatchObject([
      { name: "Common" },
      { name: "Azure" },
      { name: "Dwarvish" },
    ]);
  });

  it("keeps a blank language list empty rather than holding one blank entry", () => {
    expect(buildCandidate("races", { ...filled, languages: "  " }).languages).toEqual([]);
  });
});

describe("buildCandidate — subraces", () => {
  const filled: FormDraft = {
    ...emptyFormDraft("subraces"),
    name: "Azure Dwarf",
    parentRef: "catalog:dwarf",
    parentName: "Dwarf",
  };

  it("builds an entry its schema accepts", () => {
    expect(validateEntry("subraces", { ...buildCandidate("subraces", filled), index: "azure-dwarf" }).ok).toBe(true);
  });

  /**
   * Upstream stores a parent WITHOUT a ref prefix — a subrace's `race.index`
   * is `dwarf`, not `catalog:dwarf`. The picker hands over a ref, so the
   * prefix is stripped here, in the one place that knows both grammars.
   */
  it("stores the parent as a bare index, the way upstream does", () => {
    expect(buildCandidate("subraces", filled).race).toMatchObject({ index: "dwarf" });
  });

  it("keeps a homebrew parent's index too", () => {
    const draft = { ...filled, parentRef: "homebrew:azureborn" as const };

    expect(buildCandidate("subraces", draft).race).toMatchObject({ index: "azureborn" });
  });
});

describe("buildCandidate — equipment", () => {
  const filled: FormDraft = { ...emptyFormDraft("equipment"), name: "Sunblade", costQuantity: "50", costUnit: "gp" };

  it("builds an entry its schema accepts", () => {
    expect(validateEntry("equipment", { ...buildCandidate("equipment", filled), index: "sunblade" }).ok).toBe(true);
  });

  it("omits an unset weight rather than sending 0, which means weightless", () => {
    expect(buildCandidate("equipment", filled)).not.toHaveProperty("weight");
  });

  it("carries a set weight through", () => {
    expect(buildCandidate("equipment", { ...filled, weight: "3" }).weight).toBe(3);
  });

  it("omits the description when it is blank rather than storing an empty line", () => {
    expect(buildCandidate("equipment", filled)).not.toHaveProperty("desc");
  });

  it("splits a description into the array of lines the schema wants", () => {
    const draft = { ...filled, desc: "A blade.\n\nIt glows." };

    expect(buildCandidate("equipment", draft).desc).toEqual(["A blade.", "It glows."]);
  });
});

describe("buildCandidate — spells", () => {
  const filled: FormDraft = {
    ...emptyFormDraft("spells"),
    name: "Starfall",
    desc: "Stars fall.",
    level: "3",
    range: "120 feet",
    duration: "Instantaneous",
    castingTime: "1 action",
    school: "Evocation",
  };

  it("builds an entry its schema accepts", () => {
    expect(validateEntry("spells", { ...buildCandidate("spells", filled), index: "starfall" }).ok).toBe(true);
  });

  it("carries the level through as a number", () => {
    expect(buildCandidate("spells", filled).level).toBe(3);
  });

  it("splits the components into the array the schema wants", () => {
    expect(buildCandidate("spells", { ...filled, components: "V, S, M" }).components).toEqual(["V", "S", "M"]);
  });

  it("carries ritual and concentration through as booleans", () => {
    const draft = { ...filled, ritual: true, concentration: true };
    const built = buildCandidate("spells", draft);

    expect([built.ritual, built.concentration]).toEqual([true, true]);
  });

  it("stores the chosen classes as the references the schema wants", () => {
    const draft = { ...filled, classNames: ["Wizard", "Artificer"] };

    expect(buildCandidate("spells", draft).classes).toMatchObject([
      { index: "wizard", name: "Wizard" },
      { index: "artificer", name: "Artificer" },
    ]);
  });
});

describe("buildCandidate — subclasses (minimal form)", () => {
  const filled: FormDraft = {
    ...emptyFormDraft("subclasses"),
    name: "Storm Herald",
    parentRef: "catalog:barbarian",
    parentName: "Barbarian",
    desc: "Rage of the sky.",
  };

  it("builds an entry its schema accepts", () => {
    expect(validateEntry("subclasses", { ...buildCandidate("subclasses", filled), index: "storm-herald" }).ok).toBe(
      true,
    );
  });

  it("stores the parent class as a bare index, the way upstream does", () => {
    expect(buildCandidate("subclasses", filled).class).toMatchObject({ index: "barbarian" });
  });

  /**
   * The minimal form takes level features as PROSE. They land in `desc`,
   * which is the field the sheet already renders — inventing a structured
   * field the schema does not have would produce entries nothing reads.
   */
  it("keeps the level features as prose lines in desc", () => {
    const draft = { ...filled, desc: "Level 3: Storm Aura.\nLevel 6: Storm Soul." };

    expect(buildCandidate("subclasses", draft).desc).toEqual(["Level 3: Storm Aura.", "Level 6: Storm Soul."]);
  });
});

/**
 * The round trip is the whole reason `draftFromEntry` exists: opening an entry
 * for editing and saving it again without touching a field must not change it.
 * A lossy loader silently rewrites entries every time someone opens one to
 * look at it.
 */
describe("draftFromEntry", () => {
  it.each([
    [
      "races",
      {
        index: "azureborn",
        name: "Azureborn",
        speed: 30,
        ability_bonuses: [{ ability_score: { index: "con", name: "CON", url: "/api/ability-scores/con" }, bonus: 2 }],
        alignment: "Any",
        age: "They mature at 20.",
        size: "Medium",
        size_description: "Between 5 and 6 feet.",
        languages: [{ index: "common", name: "Common", url: "/api/languages/common" }],
        language_desc: "You speak Common.",
        url: "/api/races/azureborn",
      },
    ],
    [
      "subraces",
      {
        index: "azure-dwarf",
        name: "Azure Dwarf",
        race: { index: "dwarf", name: "Dwarf", url: "/api/races/dwarf" },
        desc: "Dwarves of the deep blue.",
        ability_bonuses: [],
        url: "/api/subraces/azure-dwarf",
      },
    ],
    [
      "equipment",
      {
        index: "sunblade",
        name: "Sunblade",
        equipment_category: { index: "weapon", name: "Weapon", url: "/api/equipment-categories/weapon" },
        cost: { quantity: 50, unit: "gp" },
        weight: 3,
        desc: ["A blade.", "It glows."],
        url: "/api/equipment/sunblade",
      },
    ],
    [
      "spells",
      {
        index: "starfall",
        name: "Starfall",
        desc: ["Stars fall."],
        range: "120 feet",
        components: ["V", "S"],
        ritual: false,
        duration: "Instantaneous",
        concentration: true,
        casting_time: "1 action",
        level: 3,
        school: { index: "evocation", name: "Evocation", url: "/api/magic-schools/evocation" },
        classes: [{ index: "wizard", name: "Wizard", url: "/api/classes/wizard" }],
        url: "/api/spells/starfall",
      },
    ],
    [
      "subclasses",
      {
        index: "storm-herald",
        name: "Storm Herald",
        class: { index: "barbarian", name: "Barbarian", url: "/api/classes/barbarian" },
        subclass_flavor: "",
        desc: ["Level 3: Storm Aura."],
        subclass_levels: "/api/subclasses/storm-herald/levels",
        url: "/api/subclasses/storm-herald",
      },
    ],
  ] as const)("round-trips a %s through the draft unchanged", (type, entry) => {
    const rebuilt = buildCandidate(type, draftFromEntry(type, entry));

    expect({ ...rebuilt, index: entry.index }).toEqual(entry);
  });

  it("loads a homebrew parent back as a homebrew ref, not a catalog one", () => {
    const draft = draftFromEntry(
      "subraces",
      {
        index: "azure",
        name: "Azure",
        race: { index: "azureborn", name: "Azureborn", url: "/api/races/azureborn" },
        desc: "",
        ability_bonuses: [],
        url: "/api/subraces/azure",
      },
      "homebrew",
    );

    expect(draft.parentRef).toBe("homebrew:azureborn");
  });

  it("defaults an unknown parent source to catalog, which is where most parents live", () => {
    const draft = draftFromEntry("subraces", {
      index: "azure",
      name: "Azure",
      race: { index: "dwarf", name: "Dwarf", url: "/api/races/dwarf" },
      desc: "",
      ability_bonuses: [],
      url: "/api/subraces/azure",
    });

    expect(draft.parentRef).toBe("catalog:dwarf");
  });
});
