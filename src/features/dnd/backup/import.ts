import type { BackupFile } from "@/features/dnd/backup/format";
import { newCharacterId } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import { modifierId } from "@/features/dnd/db/modifier-id";
import { refIndex, refSource } from "@/features/dnd/db/resolve-ref";
import type { CharacterEquipmentEntry, CharacterRecord, HomebrewEntry, Modifier, Ref } from "@/features/dnd/db/schema";
import type { HomebrewType } from "@/features/dnd/homebrew/types";
import { HOMEBREW_TYPE_ORDER, tableFor } from "@/features/dnd/homebrew/types";
import type { ValidationIssue } from "@/features/dnd/homebrew/validate";
import { validateEntry } from "@/features/dnd/homebrew/validate";

/**
 * Writing a backup file into this device's database.
 *
 * **Import always creates a new copy** — a fresh character id, an `(imported)`
 * name suffix, and a free slug for any homebrew whose index is already taken.
 * There is no undo in this app and no server copy: a visible duplicate is
 * deletable in two taps, while a silent overwrite of newer play state is
 * unrecoverable. That asymmetry is what decides it. See CONTEXT.md § Backup file.
 */

/** What was written. Shown before the write as a preview, and after it as confirmation. */
export type ImportSummary = {
  characters: number;
  homebrew: number;
};

/** The suffix that makes the copy visible rather than confusable with its original. */
const IMPORTED_SUFFIX = " (imported)";

/**
 * A homebrew entry rewritten to a free index, paired with the ref rewrite the
 * characters need. The two travel together because a renamed entry whose
 * characters were not repointed is exactly the dangling ref this feature
 * exists to prevent.
 */
type PlannedEntry = {
  type: HomebrewType;
  entry: HomebrewEntry;
  /** The index in the file, before any collision suffix. */
  from: string;
};

/**
 * Everything the write needs, resolved before a transaction is open.
 *
 * The ordering is load-bearing and mirrors the catalog re-seed: **every read
 * and every validation happens first**, because awaiting a non-Dexie promise
 * inside a Dexie transaction auto-commits it and the next write throws
 * `TransactionInactiveError`. What remains inside the transaction is writes
 * only, so a failure rolls the whole import back to nothing.
 */
type ImportPlan = {
  characters: CharacterRecord[];
  entries: PlannedEntry[];
};

/**
 * A free index within one homebrew table, suffixing `-2`, `-3`, … on collision.
 *
 * Deliberately NOT `uniqueSlug`: that one reads the database per candidate,
 * which cannot happen inside a transaction, and it slugs a *name* where this
 * has an index already. `taken` accumulates as the plan is built, so two
 * imported entries colliding with each other get distinct indices rather than
 * both landing on `-2`.
 */
function freeIndex(index: string, taken: Set<string>): string {
  if (!taken.has(index)) {
    return index;
  }
  for (let suffix = 2; ; suffix++) {
    const candidate = `${index}-${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/**
 * Rewrites one ref if it points at a homebrew entry this import renamed.
 *
 * Catalog refs are returned untouched — they resolve against this device's SRD,
 * which is the whole point of not embedding them. A homebrew ref with no entry
 * in the rename map is also left alone: it was already dangling in the file,
 * and inventing a target for it would be worse than carrying the `⚠ unknown`
 * the sheet already knows how to render.
 */
function rewriteRef<T extends Ref | string | null>(ref: T, renames: Map<string, string>): T {
  if (ref === null || refSource(ref) !== "homebrew") {
    return ref;
  }

  const index = refIndex(ref);
  const renamed = index === null ? undefined : renames.get(index);
  return (renamed === undefined ? ref : `homebrew:${renamed}`) as T;
}

/**
 * Every ref a character holds, through the rename map.
 *
 * Written field by field rather than by walking the object: the compiler then
 * catches a new ref-bearing field, where a generic deep walk would silently
 * skip it — and a skipped field is a character pointing at homebrew that
 * belongs to somebody else's entry of the same name.
 */
function rewriteCharacterRefs(character: CharacterRecord, renames: Map<string, string>): CharacterRecord {
  return {
    ...character,
    classRef: rewriteRef(character.classRef, renames),
    subclassRef: rewriteRef(character.subclassRef, renames),
    raceRef: rewriteRef(character.raceRef, renames),
    subraceRef: rewriteRef(character.subraceRef, renames),
    backgroundRef: rewriteRef(character.backgroundRef, renames),
    equipment: character.equipment.map(
      (entry): CharacterEquipmentEntry => ({ ...entry, itemRef: rewriteRef(entry.itemRef, renames) }),
    ),
    spells: {
      known: character.spells.known.map((ref) => rewriteRef(ref, renames)),
      prepared: character.spells.prepared.map((ref) => rewriteRef(ref, renames)),
    },
    modifiers: character.modifiers.map((modifier) => rewriteModifierSource(modifier, renames)),
  };
}

/**
 * A record's `source` through the same rename map.
 *
 * Separate from `rewriteRef` because it is a **different grammar**:
 * `homebrew:<type>:<index>`, not `homebrew:<index>`. That difference is
 * exactly why this needed writing rather than falling out of the field-by-field
 * style above — the compiler catches a new ref-BEARING field, and a source
 * string embedding an index is not one.
 *
 * Missing it strands the record permanently. The character would point at the
 * renamed entry while its records still named the old index, so
 * `syncEntryModifiers` — which scopes by source — could never re-derive or
 * remove them, and editing or deleting the entry could not reach them either.
 * A number on the sheet that nothing can explain and nothing can clear.
 */
function rewriteModifierSource(modifier: Modifier, renames: Map<string, string>): Modifier {
  const parts = modifier.source.split(":");
  if (parts.length !== 3 || parts[0] !== "homebrew") {
    return modifier;
  }

  const renamed = renames.get(parts[2]);
  if (renamed === undefined) {
    return modifier;
  }

  const source = `homebrew:${parts[1]}:${renamed}`;
  // The id is derived from the source, so it moves with it — otherwise the
  // merge would key on a stale id and treat the record as a stranger.
  return { ...modifier, source, id: modifierId(source, modifier.target) };
}

/**
 * Whether every complaint is about a field the schema simply does not know.
 *
 * The vendored schemas are `z.strictObject` deliberately: an upstream field
 * addition must hard-fail the *vendoring* pipeline rather than degrade
 * silently. That rule is right there and wrong here. On import the file may
 * have been written by a newer build of Sheetcraft, and refusing somebody's
 * only copy of their data over a field this build has not learned about yet is
 * the worse failure by far — especially as the entry is then written back
 * intact on the next export.
 *
 * Anything else — a wrong type, a missing required field — still refuses.
 */
function onlyUnknownKeys(issues: ValidationIssue[]): boolean {
  return issues.length > 0 && issues.every((issue) => issue.message.startsWith("Unrecognized key"));
}

/**
 * Plans the homebrew half: a free index per entry, validated against the same
 * vendored schema every other write goes through.
 *
 * Validating here means a damaged entry stops the import **before** anything is
 * written, rather than after half of it. The schema is the same gate the forms
 * and the JSON editor pass — an import is a third authoring surface, and a
 * third opinion about what a valid entry is would be a third thing to keep
 * correct.
 */
async function planHomebrew(
  file: BackupFile,
  db: SheetcraftDb,
): Promise<{ entries: PlannedEntry[]; renames: Map<string, string> }> {
  const entries: PlannedEntry[] = [];
  const renames = new Map<string, string>();

  for (const type of HOMEBREW_TYPE_ORDER) {
    const incoming = file.homebrew[type] ?? [];
    if (incoming.length === 0) {
      continue;
    }

    const taken = new Set<string>((await db.table(tableFor(type)).toCollection().primaryKeys()) as string[]);

    for (const entry of incoming) {
      const index = freeIndex(entry.index, taken);
      taken.add(index);

      // `updatedAt` is storage bookkeeping, not part of the entry — and the
      // vendored schemas are `z.strictObject`, so leaving it on makes a stored
      // entry fail the very schema it was stored under.
      //
      // `modifiers` is the OTHER side-car and is deliberately NOT stripped
      // here: it is authored content, and `validateEntry` splits it off the
      // payload itself before parsing (see `stripSideCar`). Dropping it would
      // import a subclass whose numeric effects had silently vanished — the
      // one thing a backup must never do quietly. It is still validated: a
      // malformed record fails the import rather than riding in unchecked.
      const { updatedAt: _writtenAt, ...candidate } = entry;
      const validated = validateEntry(type, { ...candidate, index });
      if (!validated.ok && !onlyUnknownKeys(validated.issues)) {
        const detail = validated.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
        throw new Error(`Homebrew ${type} "${entry.index}" in this backup is not valid — ${detail}`);
      }

      entries.push({
        type,
        from: entry.index,
        // The CANDIDATE's fields, not the schema's parsed output. The vendored
        // schemas are strict, so parsing would drop any field a newer build
        // wrote — and a round-trip through this build would then silently strip
        // data the user still has elsewhere. Validation is kept for what it is
        // good at, catching a genuinely broken entry.
        entry: { ...candidate, index, updatedAt: new Date() },
      });

      if (index !== entry.index) {
        renames.set(entry.index, index);
      }
    }
  }

  return { entries, renames };
}

/**
 * A fresh identity for an imported character: a new id, and a name that says
 * where it came from.
 *
 * `createdAt` is **kept** and `updatedAt` is **stamped**. The character was
 * genuinely created when the file says it was — overwriting that would lose the
 * only record of it — while the copy in *this* database came into existence
 * now, and the list is sorted by `updatedAt`, so a restored backup lands where
 * the user is looking.
 */
function asCopy(character: CharacterRecord, renames: Map<string, string>): CharacterRecord {
  return {
    ...rewriteCharacterRefs(character, renames),
    id: newCharacterId(),
    name: character.name.endsWith(IMPORTED_SUFFIX) ? character.name : `${character.name}${IMPORTED_SUFFIX}`,
    updatedAt: new Date(),
  };
}

/**
 * Imports a parsed backup, writing everything in **one transaction** — a
 * malformed entry halfway through leaves nothing behind, so an import either
 * happened or did not.
 *
 * Throws rather than resolving a failure: unlike a validation error on a form,
 * there is no field for the user to go and fix. The file is either importable
 * or it is not, and `parseBackup` has already answered every question that has
 * a useful answer.
 */
export async function importBackup(file: BackupFile, db: SheetcraftDb = getDb()): Promise<ImportSummary> {
  const { entries, renames } = await planHomebrew(file, db);

  const plan: ImportPlan = {
    entries,
    characters: file.characters.map((character) => asCopy(character, renames)),
  };

  const tables = [db.dnd_characters, ...new Set(plan.entries.map((planned) => db.table(tableFor(planned.type))))];

  await db.transaction("rw", tables, async () => {
    for (const planned of plan.entries) {
      await db.table(tableFor(planned.type)).put(planned.entry);
    }
    await db.dnd_characters.bulkAdd(plan.characters);
  });

  return { characters: plan.characters.length, homebrew: plan.entries.length };
}
