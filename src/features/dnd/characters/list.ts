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
 *
 * Takes the already-parsed `index` off the resolution rather than splitting
 * the ref again: `resolveRef` is the one place a ref is parsed, and a second
 * copy of that grammar here would re-open the seam.
 */
function unknownLabel(index: string): string {
  return `⚠ unknown (${index})`;
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
      return [ref, typeof name === "string" ? name : unknownLabel(resolution.index)] as const;
    }),
  );
  return new Map(entries);
}

/**
 * Reads a name the resolution pass has already produced. The map is built from
 * exactly these refs, so a miss is impossible — but defaulting to `""` would
 * render a blank row rather than say so, and a silently nameless class is the
 * kind of wrong that survives to the table.
 */
function nameOf(names: Map<Ref, string>, ref: Ref): string {
  const name = names.get(ref);
  if (name === undefined) {
    throw new Error(`No name resolved for ${ref}`);
  }
  return name;
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
    className: nameOf(classNames, character.classRef),
    raceName: nameOf(raceNames, character.raceRef),
    updatedAt: character.updatedAt,
  }));
}

/**
 * The most recent change across every character, or `null` for an empty list.
 *
 * What makes the stale-backup banner fire on a real edit rather than on every
 * visit: an old backup of data that has not moved since is not a risk worth
 * interrupting somebody over. Derived from `updatedAt` rather than tracked
 * separately, because a second timestamp maintained by every writer is a second
 * thing that can go stale — and this one already exists.
 */
export function lastChangeAt(characters: readonly { updatedAt: Date }[]): Date | null {
  if (characters.length === 0) {
    return null;
  }
  return characters.reduce(
    (latest, character) => (character.updatedAt > latest ? character.updatedAt : latest),
    characters[0].updatedAt,
  );
}
