import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import type { CatalogEntry, CharacterRecord, HomebrewEntry } from "@/features/dnd/db/schema";
import { resyncCharacter } from "@/features/dnd/homebrew/entry-modifiers";
import type { ReferencingCharacter } from "@/features/dnd/homebrew/references";
import { charactersReferencing } from "@/features/dnd/homebrew/references";
import { uniqueSlug } from "@/features/dnd/homebrew/slug";
import type { HomebrewType } from "@/features/dnd/homebrew/types";
import { HOMEBREW_TYPE_ORDER, HOMEBREW_TYPES, tableFor } from "@/features/dnd/homebrew/types";
import type { ValidationIssue } from "@/features/dnd/homebrew/validate";
import { validateEntry } from "@/features/dnd/homebrew/validate";

/**
 * The repository seam over the homebrew tables — the same shape the character
 * repository takes, and for the same reason: everything above it goes through
 * these functions, so the tests exercise the code the UI does.
 *
 * Two rules live here rather than in any caller, because a second caller would
 * otherwise have to remember them:
 *
 * - **Nothing is stored unvalidated.** Every write goes through
 *   `validateEntry`, so a form and the JSON editor cannot disagree about what
 *   a valid entry is.
 * - **A delete is refused while referenced**, by a full character scan. An
 *   edit is not — it merely reports who it reached.
 */

export type SaveResult =
  | {
      ok: true;
      entry: HomebrewEntry;
      /** Characters this edit reached. Informational — an edit is never blocked. */
      affected: ReferencingCharacter[];
    }
  | { ok: false; issues: ValidationIssue[] };

export type DeleteResult =
  | { ok: true }
  | {
      ok: false;
      /** Named in the refusal: "Zephyr and Alys are using this." */
      blockedBy: ReferencingCharacter[];
    };

/** One type's entries, for the grouped library list. */
export type HomebrewGroup = {
  type: HomebrewType;
  label: string;
  plural: string;
  entries: HomebrewEntry[];
};

/**
 * Saves an entry, creating when `existingIndex` is absent and editing when it
 * is present.
 *
 * The **index is assigned here, never taken from the caller**: it is a slug of
 * the name on create, and on edit it is the index the entry already has. A
 * rename therefore moves the display name and holds the id still — the id is
 * what every character points at, and moving it would dangle all of them.
 */
export async function saveHomebrewEntry(
  type: HomebrewType,
  candidate: Record<string, unknown>,
  existingIndex: string | undefined,
  db: SheetcraftDb = getDb(),
): Promise<SaveResult> {
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const index = existingIndex ?? (await uniqueSlug(type, name, db));

  if (index === null) {
    return {
      ok: false,
      issues: [{ path: "name", message: "This name has no letters or digits in it to build an id from." }],
    };
  }

  // Validated with the resolved index in place, so the stored entry is exactly
  // what the schema saw — including the `index` the caller never supplies.
  const validated = validateEntry(type, { ...candidate, index });
  if (!validated.ok) {
    return validated;
  }

  // `validated.entry` already carries the side-car — `validateEntry` puts it
  // back after parsing the payload — so the modifier records travel through
  // here with no special handling. `updatedAt` is restamped on every write.
  const entry: HomebrewEntry = { ...(validated.entry as CatalogEntry), index, updatedAt: new Date() };

  // The scan runs before the write and reports on the ENTRY, not on the change:
  // "who is using this" is the same question either way, and asking it first
  // means an edit that fails mid-write has not already claimed to have reached
  // anyone.
  const affected = existingIndex ? await charactersReferencing(type, existingIndex, db) : [];

  await db.table(tableFor(type)).put(entry);

  // The entry's own modifier records, pushed onto the characters already
  // holding them.
  //
  // This is what makes an entry-authored modifier agree with the live-edit
  // behaviour CONTEXT.md § Catalog reference promises. Everything else about
  // an entry is read THROUGH the ref at derive time, so an edit propagates for
  // free; a modifier is different, because `enabled` is stored player state and
  // a list rebuilt on every read has nowhere to keep it (the same reason
  // ADR-0004 attaches feature records at creation). Stored records therefore
  // have to be brought forward deliberately, and here is the one place that
  // knows an entry just changed.
  //
  // Ungated: on a CREATE the scan above is empty, so this early-returns. A
  // guard here would be dead weight that also reads as create being a case
  // with different rules.
  await propagateEntryModifiers(type, entry, affected, db);

  return { ok: true, entry, affected };
}

/**
 * Re-syncs one entry's records onto the characters that reference it.
 *
 * **Only the characters the scan already named**, rather than a second full
 * table walk: the scan is the authority on who holds this entry, and asking
 * twice invites the two answers to differ.
 *
 * A character whose records did not move is **not written**. `resyncCharacter`
 * returns `null` for it, and skipping the write is what stops an edit to an
 * entry's prose from restamping `updatedAt` on every character holding it —
 * which would reorder the character list for a change none of them can see.
 *
 * The player's `enabled` flag survives, because `syncEntryModifiers` merges
 * rather than replaces.
 */
async function propagateEntryModifiers(
  type: HomebrewType,
  entry: HomebrewEntry,
  affected: ReferencingCharacter[],
  db: SheetcraftDb,
): Promise<void> {
  if (affected.length === 0) {
    return;
  }

  const characters = await db.dnd_characters.bulkGet(affected.map((one) => one.id));

  const updated = characters
    .filter((character): character is CharacterRecord => character !== undefined)
    .map((character) => resyncCharacter(character, type, entry))
    .filter((character): character is CharacterRecord => character !== null)
    .map((character) => ({ ...character, updatedAt: new Date() }));

  if (updated.length > 0) {
    await db.dnd_characters.bulkPut(updated);
  }
}

export async function getHomebrewEntry(
  type: HomebrewType,
  index: string,
  db: SheetcraftDb = getDb(),
): Promise<HomebrewEntry | undefined> {
  return db.table(tableFor(type)).get(index) as Promise<HomebrewEntry | undefined>;
}

/**
 * Deletes an entry, refusing while any character references it.
 *
 * The refusal names the characters rather than reporting a count: "2
 * characters are using this" leaves the user hunting, and the whole reason the
 * scan is a scan and not an index is that the answer must be trustworthy.
 *
 * The scan and the delete run in one read-write transaction, so a character
 * created between the two cannot be stranded by the delete that followed it.
 */
export async function deleteHomebrewEntry(
  type: HomebrewType,
  index: string,
  db: SheetcraftDb = getDb(),
): Promise<DeleteResult> {
  const table = db.table(tableFor(type));

  return db.transaction("rw", db.dnd_characters, table, async () => {
    const blockedBy = await charactersReferencing(type, index, db);
    if (blockedBy.length > 0) {
      return { ok: false, blockedBy };
    }

    // Idempotent: an entry already gone is the outcome the caller asked for.
    await table.delete(index);
    return { ok: true };
  });
}

/**
 * One type's entries, most recently edited first — the order that puts what
 * someone is working on at the top of the list.
 *
 * Reversed in memory rather than with Dexie's `.reverse()`, which hands back
 * new object identities for unchanged rows under `cache: "immutable"` and
 * defeats downstream memoization (dexie/Dexie.js#2034).
 */
export async function listHomebrewEntries(type: HomebrewType, db: SheetcraftDb = getDb()): Promise<HomebrewEntry[]> {
  const entries = (await db.table(tableFor(type)).orderBy("updatedAt").toArray()) as HomebrewEntry[];
  return entries.reverse();
}

/**
 * Every type, grouped, **empties included**. An empty group is what tells
 * someone the type exists and can be authored; hiding it would make the
 * library a list of what they have already written rather than of what they
 * can write.
 */
export async function listHomebrewLibrary(db: SheetcraftDb = getDb()): Promise<HomebrewGroup[]> {
  return Promise.all(
    HOMEBREW_TYPE_ORDER.map(async (type) => ({
      type,
      label: HOMEBREW_TYPES[type].label,
      plural: HOMEBREW_TYPES[type].plural,
      entries: await listHomebrewEntries(type, db),
    })),
  );
}
