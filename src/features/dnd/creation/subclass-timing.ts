import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import { refIndex, refSource } from "@/features/dnd/db/resolve-ref";
import type { Ref } from "@/features/dnd/db/schema";

/**
 * When a class picks its subclass — DERIVED from the catalog, never a table of
 * twelve class names. The threshold is the first level whose `Levels` row
 * carries a `subclass` field: 1 for cleric/sorcerer/warlock, 2 for
 * druid/wizard, 3 for the other seven.
 *
 * Deriving it means the rule is read from the data rather than restated in
 * code, so a re-pin that moves a class's timing moves this with it and no
 * table of twelve class names has to be found and edited.
 *
 * The payoff does NOT yet extend to homebrew classes: `Levels` has no homebrew
 * mirror (`resolve-ref.ts` declares `levels: false`), so a homebrew class has
 * no rows to derive from and shows no subclass field. Giving homebrew classes
 * their own level rows is [#165](https://github.com/Otisz/sheetcraft/issues/165)'s
 * business, and this function needs no change when they arrive — only the
 * catalog-only guard below does.
 */

/** A `Levels` row, narrowed to the two fields this derivation reads. */
type LevelRow = {
  level?: unknown;
  class?: { index?: unknown };
  subclass?: unknown;
};

/**
 * The level at which `classRef`'s subclass becomes a required choice, or
 * `null` when the class never picks one.
 *
 * `null` — rather than an unreachable 21 — because "never chooses a subclass"
 * is a real state (a homebrew class with no subclass rows, or a class whose
 * `Levels` rows are not installed) and the caller hides the field for it. A
 * sentinel level would make that case indistinguishable from a very late one.
 *
 * The whole `Levels` table is scanned rather than queried through the
 * `[class+level]` index: the index cannot express "lowest level where a field
 * is present" — booleans are not indexable — and the table is ~240 rows.
 */
export async function subclassLevel(classRef: Ref | string, db: SheetcraftDb = getDb()): Promise<number | null> {
  const classIndex = classIndexOf(classRef);
  if (classIndex === null) {
    return null;
  }

  const rows = (await db.dnd_catalog_levels.toArray()) as LevelRow[];

  let earliest: number | null = null;
  for (const row of rows) {
    if (row.subclass === undefined || row.class?.index !== classIndex) {
      continue;
    }
    if (typeof row.level !== "number") {
      continue;
    }
    if (earliest === null || row.level < earliest) {
      earliest = row.level;
    }
  }

  return earliest;
}

/**
 * The `Levels` rows are catalog-only: `dnd_catalog_levels` has no homebrew
 * mirror (`resolve-ref.ts` declares `levels: false`), so a `homebrew:` class
 * has no rows to read and gets `null` — the subclass field simply is not shown
 * for it.
 */
function classIndexOf(classRef: Ref | string): string | null {
  return refSource(classRef) === "catalog" ? refIndex(classRef) : null;
}

/**
 * Whether the subclass field is shown and required at this level. Below the
 * threshold the field is HIDDEN but any already-chosen value is KEPT — a
 * mis-tap on the level stepper must not silently discard a choice.
 */
export function subclassRequired(threshold: number | null, level: number): boolean {
  return threshold !== null && level >= threshold;
}
