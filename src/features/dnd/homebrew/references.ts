import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import { refIndex, refSource } from "@/features/dnd/db/resolve-ref";
import type { CharacterRecord, Ref } from "@/features/dnd/db/schema";
import type { CharacterRefLocation, HomebrewType } from "@/features/dnd/homebrew/types";
import { HOMEBREW_TYPES } from "@/features/dnd/homebrew/types";

/**
 * Who is using a homebrew entry.
 *
 * A **full scan of every character**, deliberately — not a `*refs` index. An
 * index has to be maintained by every writer, and a stale one makes the delete
 * block fail *silently*, stranding a character on a ref that no longer
 * resolves. A local sheet app holds tens of characters; reading all of them is
 * cheaper than being wrong. See ADR-0002, which names this a critical path.
 */

/** Enough to name a character in a refusal, without handing the caller the record. */
export type ReferencingCharacter = {
  id: string;
  name: string;
};

/**
 * The refs one character holds at one location. Returned as an array so the
 * single-ref and many-ref locations answer the same shape; `null` refs are
 * dropped here rather than at every call site.
 */
function refsAt(character: CharacterRecord, location: CharacterRefLocation): (Ref | string)[] {
  switch (location) {
    case "classRef":
      return [character.classRef];
    case "subclassRef":
      return character.subclassRef ? [character.subclassRef] : [];
    case "raceRef":
      return [character.raceRef];
    case "subraceRef":
      return character.subraceRef ? [character.subraceRef] : [];
    case "backgroundRef":
      return character.backgroundRef ? [character.backgroundRef] : [];
    case "equipment":
      return character.equipment.map((entry) => entry.itemRef);
    case "spells":
      return [...character.spells.known, ...character.spells.prepared];
  }
}

/**
 * Whether one character points at `homebrew:<index>` of this type.
 *
 * Both halves of the ref are compared through `resolveRef`'s accessors rather
 * than by string-matching `homebrew:${index}`: the grammar is parsed in
 * exactly one place, and matching on the index alone would refuse to delete
 * `homebrew:human` because somebody is a `catalog:human`.
 */
function referencesEntry(character: CharacterRecord, type: HomebrewType, index: string): boolean {
  return HOMEBREW_TYPES[type].referencedBy.some((location) =>
    refsAt(character, location).some((ref) => refSource(ref) === "homebrew" && refIndex(ref) === index),
  );
}

/**
 * Every character pointing at one homebrew entry. Empty means the entry is
 * free to delete.
 *
 * The same list drives both sides of the asymmetry: a **delete** is refused
 * while it is non-empty, an **edit** merely reports it. An edit changes a
 * referent that still exists; a delete would strand the character. See
 * CONTEXT.md § Catalog reference.
 */
export async function charactersReferencing(
  type: HomebrewType,
  index: string,
  db: SheetcraftDb = getDb(),
): Promise<ReferencingCharacter[]> {
  const characters = await db.dnd_characters.toArray();

  return characters
    .filter((character) => referencesEntry(character, type, index))
    .map((character) => ({ id: character.id, name: character.name }));
}
