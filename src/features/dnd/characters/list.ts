import { listCharacters } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import type { RefType } from "@/features/dnd/db/resolve-ref";
import { resolveRef } from "@/features/dnd/db/resolve-ref";
import type { CharacterRecord, Ref } from "@/features/dnd/db/schema";

/**
 * What one row of the `/dnd` character list shows. A projection, not a
 * record: the row needs display *names* for class and race, and the stored
 * character carries only refs.
 *
 * Built here rather than in the component so the ref resolution — including
 * what a dangling ref renders as — is testable without a browser.
 */
export type CharacterSummary = {
  id: string;
  name: string;
  level: number;
  className: string;
  raceName: string;
  updatedAt: Date;
};

/**
 * A catalog ref can dangle after an upstream re-seed, and that is not the
 * user's doing. The row still renders, marked, rather than the whole list
 * failing. See CONTEXT.md § Catalog reference.
 */
function unknownLabel(ref: Ref | string): string {
  const separator = ref.indexOf(":");
  return `⚠ unknown (${separator === -1 ? ref : ref.slice(separator + 1)})`;
}

/**
 * Resolves every distinct ref of one type in a single pass. A party of ten
 * fighters is one lookup, not ten — the list is read on every visit to `/dnd`
 * and the refs repeat heavily.
 */
async function resolveNames(type: RefType, refs: Iterable<Ref>, db: SheetcraftDb): Promise<Map<Ref, string>> {
  const distinct = [...new Set(refs)];
  const entries = await Promise.all(
    distinct.map(async (ref) => {
      const resolution = await resolveRef(type, ref, db);
      const name = resolution.found ? resolution.entry.name : undefined;
      return [ref, typeof name === "string" ? name : unknownLabel(ref)] as const;
    }),
  );
  return new Map(entries);
}

/** Most recently updated first — the order `listCharacters` already returns. */
export async function listCharacterSummaries(db: SheetcraftDb = getDb()): Promise<CharacterSummary[]> {
  const characters: CharacterRecord[] = await listCharacters(db);

  const [classNames, raceNames] = await Promise.all([
    resolveNames(
      "classes",
      characters.map((one) => one.classRef),
      db,
    ),
    resolveNames(
      "races",
      characters.map((one) => one.raceRef),
      db,
    ),
  ]);

  return characters.map((character) => ({
    id: character.id,
    name: character.name,
    level: character.level,
    className: classNames.get(character.classRef) ?? unknownLabel(character.classRef),
    raceName: raceNames.get(character.raceRef) ?? unknownLabel(character.raceRef),
    updatedAt: character.updatedAt,
  }));
}
