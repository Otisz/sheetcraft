/**
 * Acquiring and dropping equipment and spells — the pure half.
 *
 * Every rule about what a loadout change *means* lives here rather than in the
 * drawers that call it: that a second longsword is a quantity rather than a
 * second row, that unpreparing a spell does not forget it. Pure — no React, no
 * Dexie, like the rest of `play/`. See ADR-0007.
 *
 * The **writes** these produce do not go through `updateCharacter`. Both
 * `equipment` and `spells` are ref-bearing, so a change to either has to
 * re-sync the modifier records the referenced homebrew entries author —
 * `updateCharacterRefs` in the repository is the seam that does both together.
 */
import type { CharacterEquipmentEntry, CharacterSpells, Ref } from "@/features/dnd/db/schema";

/**
 * Acquires one of an item.
 *
 * A second copy raises the **quantity** rather than appending a second row.
 * Two rows for one ref would each carry their own `equipped` flag, and a
 * shield that is both equipped and not is a contradiction `derive()` would
 * resolve by counting the AC twice.
 */
export function addItem(equipment: CharacterEquipmentEntry[], itemRef: Ref): CharacterEquipmentEntry[] {
  if (equipment.some((one) => one.itemRef === itemRef)) {
    return equipment.map((one) => (one.itemRef === itemRef ? { ...one, quantity: one.quantity + 1 } : one));
  }

  // Acquired unequipped: picking a breastplate up is not putting it on, and an
  // item that armored the character the moment it was acquired would move AC
  // with nothing the player did saying so.
  return [...equipment, { itemRef, quantity: 1, equipped: false }];
}

/**
 * Drops an item entirely, however many were carried.
 *
 * Idempotent: removing what is not there is not an error, matching
 * `deleteCharacter` and `toggleCondition`. A drawer whose list and whose write
 * disagreed for one frame would otherwise throw at the player.
 */
export function removeItem(equipment: CharacterEquipmentEntry[], itemRef: Ref): CharacterEquipmentEntry[] {
  return equipment.filter((one) => one.itemRef !== itemRef);
}

/**
 * Sets how many of an item is carried.
 *
 * **Floors at one**, rather than removing the row at zero. Dropping the last
 * arrow would take the row's `equipped` flag with it, so a player stepping
 * down past zero and back up would find their quiver unequipped. Removing is
 * `removeItem`, which is a separate action with its own control.
 */
export function setQuantity(
  equipment: CharacterEquipmentEntry[],
  itemRef: Ref,
  quantity: number,
): CharacterEquipmentEntry[] {
  return equipment.map((one) =>
    one.itemRef === itemRef ? { ...one, quantity: Math.max(1, Math.trunc(quantity)) } : one,
  );
}

/**
 * Equips or unequips an item.
 *
 * This is the **only** way `equipped` moves, which is what keeps the rule
 * `effects.ts` states — "two ways to unequip a shield is one way too many".
 * The `equip:` records `derive()` builds off this flag are deliberately absent
 * from the effects drawer's toggle list, so the flag itself is the single
 * switch.
 */
export function toggleEquipped(equipment: CharacterEquipmentEntry[], itemRef: Ref): CharacterEquipmentEntry[] {
  return equipment.map((one) => (one.itemRef === itemRef ? { ...one, equipped: !one.equipped } : one));
}

/**
 * Learns a spell.
 *
 * Added **unprepared**: knowing a spell and having it prepared are different
 * states the sheet renders differently, and a spell that arrived prepared
 * would claim a slot of the player's daily preparation that they did not
 * spend.
 *
 * A spell already known is not learned twice — `sections.ts` unions the two
 * lists, so a duplicate would render one row while the record held two.
 */
export function addSpell(spells: CharacterSpells, spellRef: Ref): CharacterSpells {
  if (spells.known.includes(spellRef)) {
    return spells;
  }
  return { ...spells, known: [...spells.known, spellRef] };
}

/**
 * Forgets a spell, from **both** lists.
 *
 * Prepared is not a subset of known — a cleric prepares from the whole class
 * list, which is why `spellSection` unions rather than filters — so dropping
 * it from `known` alone would leave it on the sheet, prepared, with no way to
 * remove it.
 */
export function removeSpell(spells: CharacterSpells, spellRef: Ref): CharacterSpells {
  return {
    known: spells.known.filter((one) => one !== spellRef),
    prepared: spells.prepared.filter((one) => one !== spellRef),
  };
}

/**
 * Prepares or unprepares a spell.
 *
 * Unpreparing does **not** forget it: a wizard keeps the spell in their book
 * across a preparation change, and losing it would make the daily churn of
 * preparation destructive. Forgetting is `removeSpell`.
 *
 * A spell not in `known` may still be prepared, for the reason `removeSpell`
 * gives: a prepared-caster's list is the class list, not a known list.
 */
export function togglePrepared(spells: CharacterSpells, spellRef: Ref): CharacterSpells {
  return {
    ...spells,
    prepared: spells.prepared.includes(spellRef)
      ? spells.prepared.filter((one) => one !== spellRef)
      : [...spells.prepared, spellRef],
  };
}

/**
 * Every spell the character holds, each listed once.
 *
 * A **union, not a filter**: `prepared` is not a subset of `known`, so
 * filtering would hide a spell the player prepared. That rule was written in
 * three places before this function existed — `spellSection`, and twice in the
 * spells drawer — which is three spellings of one rule and two chances for one
 * of them to become a filter. See CONTEXT.md § Loadout.
 */
export function heldSpells(spells: CharacterSpells): Ref[] {
  return [...new Set([...spells.known, ...spells.prepared])];
}
