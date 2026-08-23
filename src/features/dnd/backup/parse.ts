import * as z from "zod";
import type { BackupFile, BackupHomebrew } from "@/features/dnd/backup/format";
import { BACKUP_FORMAT, CURRENT_SCHEMA_VERSION, FORMAT_VERSION } from "@/features/dnd/backup/format";
import { migrateCharacter } from "@/features/dnd/backup/migrate";
import type { CharacterRecord, HomebrewEntry } from "@/features/dnd/db/schema";
import { HOMEBREW_TYPE_ORDER } from "@/features/dnd/homebrew/types";

/**
 * Reading a backup file — pure, no Dexie, so every refusal is testable without
 * a browser and nothing is written before the file is understood.
 *
 * The validation here is deliberately **loose where the schema is loose and
 * strict where the sheet would break**. A homebrew entry is validated by
 * `validateEntry` against its vendored catalog schema on the way in; a
 * character is checked only for the fields nothing can render without. Unknown
 * fields survive throughout, so a file written by a newer build of the same
 * format version round-trips through this one without being silently stripped.
 */

export type ParseFailure =
  /** Not JSON at all. */
  | "unreadable"
  /** Well-formed JSON, but not carrying our discriminator. */
  | "not-a-backup"
  /** A backup this build must not guess at. */
  | "newer-format"
  /** Ours, right version, wrong shape. */
  | "malformed";

export type ParseResult =
  | { ok: true; file: BackupFile }
  | { ok: false; reason: ParseFailure; message: string; issues?: string[] };

/**
 * The envelope, checked for the fields that decide whether to read on. Values
 * pass through untouched — the records themselves are handled below, where
 * unknown-field preservation matters.
 */
const ENVELOPE = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().positive(),
  schemaVersion: z.number().int().nonnegative(),
  exportedAt: z.string().optional(),
  characters: z.array(z.looseObject({})),
  homebrew: z.record(z.string(), z.array(z.looseObject({}))).optional(),
});

/**
 * A character's load-bearing fields. Anything absent here leaves the sheet
 * with nothing to render — a nameless character in a list, or a class ref
 * nothing can derive from — so importing it would produce a row the user
 * cannot use and cannot explain.
 *
 * Everything else is left alone: play state and proficiencies have defaults
 * the record already knows, and rejecting a whole backup over a missing
 * `tempHp` would refuse the only copy of somebody's character.
 */
const CHARACTER = z.looseObject({
  id: z.string().min(1),
  name: z.string(),
  level: z.number().int().positive(),
  classRef: z.string().min(1),
  raceRef: z.string().min(1),
});

/** A homebrew entry needs an `index` — it is the key its table is stored under. */
const HOMEBREW_ENTRY = z.looseObject({ index: z.string().min(1) });

/**
 * ISO strings back into `Date`s. JSON has no date type, so `createdAt` arrives
 * as a string and would be stored as one — `orderBy("updatedAt")` then sorts a
 * mix of strings and Dates, which is a list in no order at all.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function reviveDates<T>(value: T): T {
  if (typeof value === "string") {
    return (ISO_DATE.test(value) ? new Date(value) : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(reviveDates) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, reviveDates(entry)])) as T;
  }
  return value;
}

function fail(reason: ParseFailure, message: string, issues?: string[]): ParseResult {
  return { ok: false, reason, message, issues };
}

function issuesOf(error: z.ZodError, prefix: string): string[] {
  return error.issues.map(
    (issue) => `${prefix}${issue.path.length ? `.${issue.path.join(".")}` : ""}: ${issue.message}`,
  );
}

/**
 * Every homebrew group named, empties included. A file that omitted a group
 * — an older build that predates a type — reads as "no entries of that type"
 * rather than as an absent key every caller then has to guard.
 */
function homebrewGroups(
  raw: Record<string, unknown[]> | undefined,
): { ok: true; homebrew: BackupHomebrew } | { ok: false; issues: string[] } {
  const homebrew = {} as BackupHomebrew;
  const issues: string[] = [];

  for (const type of HOMEBREW_TYPE_ORDER) {
    const entries = raw?.[type] ?? [];
    const parsed = z.array(HOMEBREW_ENTRY).safeParse(entries);
    if (!parsed.success) {
      issues.push(...issuesOf(parsed.error, `homebrew.${type}`));
      continue;
    }
    homebrew[type] = parsed.data.map((entry) => reviveDates(entry) as HomebrewEntry);
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, homebrew };
}

/**
 * Backup text as a file this build can import, or a refusal that says which
 * kind of wrong it is — the four reasons offer the user four different things,
 * and a single "invalid file" would offer none of them.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unparseable.";
    return fail("unreadable", `That file isn't readable as JSON — ${detail}`);
  }

  const envelope = ENVELOPE.safeParse(raw);
  if (!envelope.success) {
    // A wrong discriminator means the user picked the wrong file; a right one
    // with a wrong body means the file is ours and damaged. Different problems,
    // different next steps.
    const isOurs = typeof raw === "object" && raw !== null && (raw as { format?: unknown }).format === BACKUP_FORMAT;
    return isOurs
      ? fail("malformed", "That backup is damaged and can't be read.", issuesOf(envelope.error, "(root)"))
      : fail("not-a-backup", "That file isn't a Sheetcraft backup.");
  }

  // Refused, never guessed at: unknown envelope fields could carry meaning this
  // build would drop, and the user still has the file.
  if (envelope.data.formatVersion > FORMAT_VERSION) {
    return fail("newer-format", "This backup was made by a newer version of Sheetcraft.");
  }

  const characters = z.array(CHARACTER).safeParse(envelope.data.characters);
  if (!characters.success) {
    return fail(
      "malformed",
      "That backup contains a character that can't be read.",
      issuesOf(characters.error, "characters"),
    );
  }

  const homebrew = homebrewGroups(envelope.data.homebrew);
  if (!homebrew.ok) {
    return fail("malformed", "That backup contains a homebrew entry that can't be read.", homebrew.issues);
  }

  return {
    ok: true,
    file: {
      format: BACKUP_FORMAT,
      formatVersion: envelope.data.formatVersion,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: envelope.data.exportedAt ?? new Date().toISOString(),
      characters: characters.data.map(
        (character) => migrateCharacter(reviveDates(character), envelope.data.schemaVersion) as CharacterRecord,
      ),
      homebrew: homebrew.homebrew,
    },
  };
}
