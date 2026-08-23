import { CURRENT_SCHEMA_VERSION } from "@/features/dnd/backup/format";

/**
 * Migrating an imported character record forward through the schema chain.
 *
 * The chain lives here rather than in Dexie's `version().upgrade()` because a
 * backup file's records do not pass through Dexie's upgrade path at all: they
 * arrive as plain objects and are written into a database that is *already* at
 * the current version. Dexie's number does not travel inside a file, which is
 * why `schemaVersion` sits on the record. See CONTEXT.md § Backup file.
 *
 * A step is registered under the version it migrates FROM, so applying every
 * step from the file's version up to `CURRENT_SCHEMA_VERSION` walks the chain
 * with no step chosen by hand.
 */

/** One record, mid-migration. Deliberately untyped: it is not a `CharacterRecord` until the last step. */
type LooseRecord = Record<string, unknown>;

/**
 * Keyed by the version the step migrates FROM. Empty because the schema has
 * not moved yet — version 1 is the first — and the table is what makes adding
 * a step a one-line change rather than a rewrite of the walk below.
 */
const STEPS: Record<number, (record: LooseRecord) => LooseRecord> = {};

/**
 * Walks a record forward to the current version.
 *
 * A **missing step is not an error**: a schemaVersion bump that changes nothing
 * about a character — a new table, an index — has no work to do here, and
 * demanding a no-op function per version would make the chain a formality
 * somebody eventually fills with `(r) => r`.
 *
 * The version is stamped last, from `CURRENT_SCHEMA_VERSION` rather than from
 * whatever the file claimed, so a record that has been walked says so.
 */
export function migrateCharacter(record: unknown, fromVersion: number): unknown {
  if (typeof record !== "object" || record === null) {
    return record;
  }

  let migrated = record as LooseRecord;
  for (let version = fromVersion; version < CURRENT_SCHEMA_VERSION; version++) {
    migrated = STEPS[version]?.(migrated) ?? migrated;
  }

  return { ...migrated, schemaVersion: CURRENT_SCHEMA_VERSION };
}
