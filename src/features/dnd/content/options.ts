import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import type { RefSource } from "@/features/dnd/db/resolve-ref";
import { refIndex } from "@/features/dnd/db/resolve-ref";
import type { CatalogEntry, Ref } from "@/features/dnd/db/schema";

/**
 * What the content pickers offer: SRD first, then homebrew under an `HB`
 * badge. Reading and ordering live here rather than in the components so the
 * grouping is testable without a browser. See ADR-0002.
 */

export type PickerOption = {
  /** What the draft stores — `catalog:dwarf`, `homebrew:azureborn`. */
  ref: Ref;
  name: string;
  /** Which group the option sits in, and what the badge is driven off. */
  source: RefSource;
  /** The whole entry, so a caller reading ability bonuses needs no second lookup. */
  entry: CatalogEntry;
};

/**
 * An entry's display name. Falls back to the index rather than to a blank
 * label: a homebrew entry saved without a name should still be pickable and
 * still be identifiable.
 */
function nameOf(entry: CatalogEntry): string {
  return typeof entry.name === "string" && entry.name !== "" ? entry.name : entry.index;
}

function toOptions(entries: CatalogEntry[], source: RefSource): PickerOption[] {
  return entries
    .map((entry) => ({ ref: `${source}:${entry.index}` as Ref, name: nameOf(entry), source, entry }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Both tables for one type, catalog group first. The order is the picker's
 * order: SRD is what most people want, homebrew is what a few people want a
 * lot, and mixing them alphabetically would bury the SRD entries.
 */
async function loadPair(
  db: SheetcraftDb,
  catalogTable: string,
  homebrewTable: string,
  filter?: (entry: CatalogEntry) => boolean,
): Promise<PickerOption[]> {
  const [catalog, homebrew] = await Promise.all([
    db.table(catalogTable).toArray() as Promise<CatalogEntry[]>,
    db.table(homebrewTable).toArray() as Promise<CatalogEntry[]>,
  ]);

  const keep = filter ?? (() => true);
  return [...toOptions(catalog.filter(keep), "catalog"), ...toOptions(homebrew.filter(keep), "homebrew")];
}

export function loadClassOptions(db: SheetcraftDb = getDb()): Promise<PickerOption[]> {
  return loadPair(db, "dnd_catalog_classes", "dnd_homebrew_classes");
}

export function loadRaceOptions(db: SheetcraftDb = getDb()): Promise<PickerOption[]> {
  return loadPair(db, "dnd_catalog_races", "dnd_homebrew_races");
}

/** Subclasses of one class. Empty when no class is chosen — the field is hidden then anyway. */
export async function loadSubclassOptions(classRef: Ref | null, db: SheetcraftDb = getDb()): Promise<PickerOption[]> {
  const parent = refIndex(classRef);
  if (!parent) {
    return [];
  }

  return loadPair(db, "dnd_catalog_subclasses", "dnd_homebrew_subclasses", (entry) => {
    const owner = (entry as { class?: { index?: unknown } }).class?.index;
    return owner === parent;
  });
}

/**
 * Subraces of one race. An empty result is what hides the subrace field —
 * only four SRD races have subraces at all.
 */
export async function loadSubraceOptions(raceRef: Ref | null, db: SheetcraftDb = getDb()): Promise<PickerOption[]> {
  const parent = refIndex(raceRef);
  if (!parent) {
    return [];
  }

  return loadPair(db, "dnd_catalog_subraces", "dnd_homebrew_subraces", (entry) => {
    const owner = (entry as { race?: { index?: unknown } }).race?.index;
    return owner === parent;
  });
}
