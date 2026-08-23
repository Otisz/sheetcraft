import type { BackupFile, BackupHomebrew } from "@/features/dnd/backup/format";
import { BACKUP_FORMAT, CURRENT_SCHEMA_VERSION, FORMAT_VERSION } from "@/features/dnd/backup/format";
import { getCharacter, listCharacters } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import type { CharacterRecord, HomebrewEntry } from "@/features/dnd/db/schema";
import { homebrewRefsOf } from "@/features/dnd/homebrew/references";
import type { HomebrewType } from "@/features/dnd/homebrew/types";
import { HOMEBREW_TYPE_ORDER, tableFor } from "@/features/dnd/homebrew/types";

/**
 * Building the backup file. See CONTEXT.md § Backup file.
 *
 * Read-only over Dexie and injected-`db` like every other repository function,
 * so the round-trip test can export from one database and import into another
 * without a browser.
 */

/**
 * The homebrew a set of characters reaches, embedded in full.
 *
 * **Only what is referenced**, so a one-character share does not drag the whole
 * library along — and everything that is referenced, because a file carrying
 * bare `homebrew:` ids restores onto a wiped device as a broken character,
 * which is exactly the dangling state the delete block exists to prevent.
 *
 * A ref pointing at an entry that is already gone is **dropped, not embedded as
 * a hole**: the character survives with a dangling ref that renders as
 * `⚠ unknown`, which is the state it was already in before the export.
 */
async function collectHomebrew(characters: CharacterRecord[], db: SheetcraftDb): Promise<BackupHomebrew> {
  const groups = await Promise.all(
    HOMEBREW_TYPE_ORDER.map(async (type) => [type, await entriesFor(type, characters, db)] as const),
  );

  return Object.fromEntries(groups) as BackupHomebrew;
}

async function entriesFor(
  type: HomebrewType,
  characters: CharacterRecord[],
  db: SheetcraftDb,
): Promise<HomebrewEntry[]> {
  const indices = [...new Set(characters.flatMap((character) => homebrewRefsOf(character, type)))];
  if (indices.length === 0) {
    return [];
  }

  const found = (await db.table(tableFor(type)).bulkGet(indices)) as (HomebrewEntry | undefined)[];
  return found.filter((entry): entry is HomebrewEntry => entry !== undefined);
}

/**
 * The backup file for one character, or for everything when `characterId` is
 * absent. Two entry points, one format: "back up everything" is the recovery
 * tool, per-character export is for sharing, and the second is a subset of the
 * first rather than a second shape to keep in step.
 *
 * A `characterId` that no longer names anything produces an **empty file**
 * rather than throwing — a delete racing an export is not an exception, and
 * the caller has nothing better to do with a rejection.
 */
export async function collectBackup(characterId?: string, db: SheetcraftDb = getDb()): Promise<BackupFile> {
  const characters = characterId === undefined ? await listCharacters(db) : await oneCharacter(characterId, db);

  return {
    format: BACKUP_FORMAT,
    formatVersion: FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    characters,
    homebrew: await collectHomebrew(characters, db),
  };
}

async function oneCharacter(id: string, db: SheetcraftDb): Promise<CharacterRecord[]> {
  const character = await getCharacter(id, db);
  return character ? [character] : [];
}
