import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import { refIndex } from "@/features/dnd/db/resolve-ref";
import type { CatalogEntry, Ref } from "@/features/dnd/db/schema";

/**
 * Which class features a character has unlocked.
 *
 * One scan, two readers: the Features tab renders their prose, and
 * `syncFeatureModifiers` turns the few that change a number into modifier
 * records. Two copies of this filter would be two places for "a Berserker sees
 * Frenzy and a Totem Warrior does not" to drift apart.
 *
 * A miss degrades rather than throws, as everywhere else the sheet reads the
 * catalog: a ref can dangle after an upstream re-seed, and that is not the
 * player's doing.
 */

/** What the scan is scoped by. Taken loose rather than as a whole character, because creation has no character yet. */
export type ClassFeatureScope = {
  classRef: Ref | null;
  subclassRef: Ref | null;
  level: number;
};

/**
 * The rows, in level order.
 *
 * Scoped three ways, and each exclusion matters:
 *
 * - **By class**, so a rogue's Sneak Attack never appears on a barbarian.
 * - **By level**, so a level 3 character is not shown level 9 prose as though
 *   they had it.
 * - **By subclass**, so a Berserker sees Frenzy and a Totem Warrior does not.
 *   A feature carrying *no* subclass belongs to the base class and is always
 *   included; one carrying a different subclass is dropped.
 */
export async function loadClassFeatures(scope: ClassFeatureScope, db: SheetcraftDb = getDb()): Promise<CatalogEntry[]> {
  const classIndex = refIndex(scope.classRef);
  if (!classIndex) {
    return [];
  }

  const subclassIndex = refIndex(scope.subclassRef);

  const rows = await db.dnd_catalog_features.filter((entry) => {
    const owner = (entry.class as { index?: unknown } | undefined)?.index;
    if (owner !== classIndex) {
      return false;
    }

    const level = entry.level;
    if (typeof level !== "number" || level > scope.level) {
      return false;
    }

    const subclass = (entry.subclass as { index?: unknown } | undefined)?.index;
    return subclass === undefined || subclass === subclassIndex;
  });

  const features = await rows.toArray();
  return features.sort((a, b) => (a.level as number) - (b.level as number));
}
