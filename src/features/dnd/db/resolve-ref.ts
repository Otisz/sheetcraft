import type { SheetcraftDb, TableName } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import type { CatalogEntry, Ref } from "@/features/dnd/db/schema";

/**
 * Which of the 14 catalog types have a homebrew mirror. Only 7 are
 * authorable — a `homebrew:` ref to any other type is a miss, not a lookup
 * against a table that does not exist.
 */
const HAS_HOMEBREW_MIRROR = {
  classes: true,
  subclasses: true,
  races: true,
  subraces: true,
  backgrounds: true,
  levels: false,
  features: false,
  traits: false,
  equipment: true,
  equipment_categories: false,
  proficiencies: false,
  skills: false,
  ability_scores: false,
  spells: true,
} as const;

export type RefType = keyof typeof HAS_HOMEBREW_MIRROR;

export type RefSource = "catalog" | "homebrew";

export type ParsedRef = {
  source: RefSource;
  /** The entry's `index` — the part after the prefix. */
  index: string;
};

/**
 * The result of a lookup. A miss is a value the caller renders as
 * `⚠ unknown (<index>)`, falling back to base rather than throwing: a catalog
 * ref can dangle after an upstream re-seed, and that is not the user's doing.
 */
export type RefResolution<T extends CatalogEntry = CatalogEntry> =
  | { found: true; source: RefSource; index: string; entry: T }
  | { found: false; source: RefSource | null; index: string; reason: RefMissReason };

export type RefMissReason =
  | "malformed" // not `catalog:x` / `homebrew:x`
  | "not-authorable" // `homebrew:` against a type with no homebrew mirror
  | "missing"; // well-formed, but no such entry

/**
 * The **only** place a `catalog:` / `homebrew:` string is parsed. Deliberately
 * module-private: exporting it would let a caller re-implement the grammar
 * around it. Callers that need one half of a ref use `refIndex` / `refSource`
 * below, which are this function's accessors rather than a second parser. See
 * CONTEXT.md § Catalog reference.
 */
function parseRef(ref: string): ParsedRef | null {
  const separator = ref.indexOf(":");
  if (separator === -1) {
    return null;
  }

  const source = ref.slice(0, separator);
  const index = ref.slice(separator + 1);
  if (index === "" || (source !== "catalog" && source !== "homebrew")) {
    return null;
  }

  return { source, index };
}

/** The table a parsed ref addresses, or `null` if that combination has none. */
function tableNameForRef(type: RefType, source: RefSource): TableName | null {
  if (source === "homebrew" && !HAS_HOMEBREW_MIRROR[type]) {
    return null;
  }
  return `dnd_${source}_${type}` as TableName;
}

/**
 * Looks a ref up in the table its prefix selects. Never throws for a bad ref
 * or a missing entry — an unresolvable ref comes back as a miss the caller can
 * render.
 */
export async function resolveRef<T extends CatalogEntry = CatalogEntry>(
  type: RefType,
  ref: Ref | string,
  db: SheetcraftDb = getDb(),
): Promise<RefResolution<T>> {
  const parsed = parseRef(ref);
  if (!parsed) {
    return { found: false, source: null, index: ref, reason: "malformed" };
  }

  const tableName = tableNameForRef(type, parsed.source);
  if (!tableName) {
    return { found: false, source: parsed.source, index: parsed.index, reason: "not-authorable" };
  }

  const entry = (await db.table(tableName).get(parsed.index)) as T | undefined;
  if (!entry) {
    return { found: false, source: parsed.source, index: parsed.index, reason: "missing" };
  }

  return { found: true, source: parsed.source, index: parsed.index, entry };
}

/**
 * The entry `index` a ref names, or `null` when the ref is malformed.
 *
 * Exists so that a caller filtering catalog rows by their parent — a
 * subclass's `class.index`, a subrace's `race.index`, both of which upstream
 * stores WITHOUT a prefix — does not hand-roll the grammar. Rejecting a
 * prefix-less string is the point: `"human"` is not a ref, and treating it as
 * a bare index would silently accept the one input that means a bug upstream.
 */
export function refIndex(ref: Ref | string | null | undefined): string | null {
  if (ref === null || ref === undefined) {
    return null;
  }
  return parseRef(ref)?.index ?? null;
}

/** Which table a ref selects, or `null` when the ref is malformed. */
export function refSource(ref: Ref | string | null | undefined): RefSource | null {
  if (ref === null || ref === undefined) {
    return null;
  }
  return parseRef(ref)?.source ?? null;
}
