import { describe, expect, it } from "vitest";
import type { CharacterEquipmentEntry, Ref } from "@/features/dnd/db/schema";
import {
  addItem,
  addSpell,
  heldSpells,
  removeItem,
  removeSpell,
  setQuantity,
  toggleEquipped,
  togglePrepared,
} from "@/features/dnd/play/loadout";

/**
 * The pure half of acquiring and dropping things — what the two `⋯` drawers
 * report, before any of it reaches Dexie. Kept apart from the drawers for the
 * reason the rest of `play/` is: the interesting rules here are about what a
 * second copy of an item means and whether unpreparing a spell forgets it, and
 * a rule buried in JSX is one nothing can test. See ADR-0007.
 */

const LONGSWORD = "catalog:longsword" as Ref;
const SHIELD = "catalog:shield" as Ref;

const CARRYING: CharacterEquipmentEntry[] = [
  { itemRef: LONGSWORD, quantity: 1, equipped: true },
  { itemRef: SHIELD, quantity: 1, equipped: false },
];

describe("addItem", () => {
  it("appends an item the character is not already carrying, unequipped", () => {
    expect(addItem([], LONGSWORD)).toEqual([{ itemRef: LONGSWORD, quantity: 1, equipped: false }]);
  });

  it("adds to the quantity rather than appending a second row for the same item", () => {
    const added = addItem(CARRYING, SHIELD);

    expect(added).toHaveLength(2);
    expect(added.find((one) => one.itemRef === SHIELD)?.quantity).toBe(2);
  });

  it("leaves the equipped flag alone when a second copy arrives", () => {
    expect(addItem(CARRYING, LONGSWORD).find((one) => one.itemRef === LONGSWORD)?.equipped).toBe(true);
  });
});

describe("removeItem", () => {
  it("drops the whole row, however many were carried", () => {
    const carrying = setQuantity(CARRYING, SHIELD, 5);

    expect(removeItem(carrying, SHIELD).map((one) => one.itemRef)).toEqual([LONGSWORD]);
  });

  it("is idempotent — dropping what is not carried is not an error", () => {
    expect(removeItem(CARRYING, "catalog:rope" as Ref)).toEqual(CARRYING);
  });
});

describe("setQuantity", () => {
  it("writes the count the player typed", () => {
    expect(setQuantity(CARRYING, SHIELD, 4).find((one) => one.itemRef === SHIELD)?.quantity).toBe(4);
  });

  it("floors at one, since a zero-quantity row is a row of nothing", () => {
    expect(setQuantity(CARRYING, SHIELD, 0).find((one) => one.itemRef === SHIELD)?.quantity).toBe(1);
  });
});

describe("toggleEquipped", () => {
  it("flips the flag the equip: modifiers are driven by", () => {
    expect(toggleEquipped(CARRYING, SHIELD).find((one) => one.itemRef === SHIELD)?.equipped).toBe(true);
    expect(toggleEquipped(CARRYING, LONGSWORD).find((one) => one.itemRef === LONGSWORD)?.equipped).toBe(false);
  });

  it("touches nothing else", () => {
    expect(toggleEquipped(CARRYING, SHIELD).find((one) => one.itemRef === LONGSWORD)).toEqual(CARRYING[0]);
  });
});

const MAGIC_MISSILE = "catalog:magic-missile" as Ref;
const SHIELD_SPELL = "catalog:shield" as Ref;

const SPELLS = { known: [MAGIC_MISSILE], prepared: [MAGIC_MISSILE] };

describe("addSpell", () => {
  it("adds to known, unprepared", () => {
    expect(addSpell({ known: [], prepared: [] }, MAGIC_MISSILE)).toEqual({
      known: [MAGIC_MISSILE],
      prepared: [],
    });
  });

  it("does not learn the same spell twice", () => {
    expect(addSpell(SPELLS, MAGIC_MISSILE).known).toEqual([MAGIC_MISSILE]);
  });

  it("leaves a spell already prepared prepared", () => {
    expect(addSpell(SPELLS, MAGIC_MISSILE).prepared).toEqual([MAGIC_MISSILE]);
  });
});

describe("removeSpell", () => {
  it("forgets it from both lists, so no prepared spell outlives being known", () => {
    expect(removeSpell(SPELLS, MAGIC_MISSILE)).toEqual({ known: [], prepared: [] });
  });

  it("is idempotent", () => {
    expect(removeSpell(SPELLS, SHIELD_SPELL)).toEqual(SPELLS);
  });
});

describe("togglePrepared", () => {
  it("prepares a known spell", () => {
    expect(togglePrepared({ known: [MAGIC_MISSILE], prepared: [] }, MAGIC_MISSILE).prepared).toEqual([MAGIC_MISSILE]);
  });

  it("unprepares without forgetting — a wizard keeps the spell in their book", () => {
    expect(togglePrepared(SPELLS, MAGIC_MISSILE)).toEqual({ known: [MAGIC_MISSILE], prepared: [] });
  });

  it("prepares a spell that was never known, since a cleric prepares from the class list", () => {
    expect(togglePrepared({ known: [], prepared: [] }, SHIELD_SPELL)).toEqual({
      known: [],
      prepared: [SHIELD_SPELL],
    });
  });
});

describe("heldSpells", () => {
  it("unions known and prepared, since a prepared spell need never have been known", () => {
    expect(heldSpells({ known: [MAGIC_MISSILE], prepared: [SHIELD_SPELL] })).toEqual([MAGIC_MISSILE, SHIELD_SPELL]);
  });

  it("lists a spell that is both exactly once", () => {
    expect(heldSpells(SPELLS)).toEqual([MAGIC_MISSILE]);
  });
});
