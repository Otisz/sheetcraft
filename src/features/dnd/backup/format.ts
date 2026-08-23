import type { CharacterRecord, HomebrewEntry } from "@/features/dnd/db/schema";
import type { HomebrewType } from "@/features/dnd/homebrew/types";

/**
 * The backup file's envelope. See CONTEXT.md § Backup file.
 *
 * This exists because WebKit deletes IndexedDB after 7 days of Safari use
 * without a tap on the site — silently, with no event to hook — and Sheetcraft
 * has no server copy. The file is the only universal mitigation.
 */

/**
 * The discriminator, so a JSON file that is merely well-formed cannot be
 * mistaken for a backup. Carries the game, because the format is dnd-scoped
 * exactly like the storage is.
 */
export const BACKUP_FORMAT = "sheetcraft.dnd2014.backup";

/**
 * The ENVELOPE version — the shape below, not the records inside. Bumped when
 * this file's own structure changes; a newer one is refused, never guessed at.
 */
export const FORMAT_VERSION = 1;

/**
 * The record version the file was written from, travelling with the file
 * because Dexie's own version number does not. An older file migrates forward
 * through the same chain; see `migrateCharacter`.
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * The embedded homebrew, keyed by type. Every authorable type is present —
 * including as an empty array — so a reader never has to distinguish "no
 * entries of this type" from "this file predates the type".
 */
export type BackupHomebrew = Record<HomebrewType, HomebrewEntry[]>;

/**
 * Characters plus **only the homebrew they reference**. Catalog refs are not
 * embedded: they resolve against the importing device's SRD, which is the
 * point of vendoring a versioned catalog.
 */
export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  /** ISO 8601. Informational — the durability panel reads `dnd_meta`, not this. */
  exportedAt: string;
  characters: CharacterRecord[];
  homebrew: BackupHomebrew;
};

/**
 * The filename a backup is offered under. Date only, not a timestamp: a
 * filename is read by a human choosing between two files in a Files app, and
 * seconds do not help them.
 */
export function backupFilename(exportedAt: Date, characterName?: string): string {
  if (characterName !== undefined) {
    const slug = characterSlug(characterName);
    return slug === "" ? `sheetcraft-character-${isoDate(exportedAt)}.json` : `sheetcraft-${slug}.json`;
  }
  return `sheetcraft-backup-${isoDate(exportedAt)}.json`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A character name as a filename fragment. Deliberately NOT `slugify` from the
 * homebrew feature: that one assigns a stable ID a character record points at,
 * and sharing its implementation would couple a cosmetic filename to a rule
 * about dangling references.
 */
function characterSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
