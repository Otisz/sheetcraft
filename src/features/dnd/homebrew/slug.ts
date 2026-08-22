import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import type { HomebrewType } from "@/features/dnd/homebrew/types";
import { tableFor } from "@/features/dnd/homebrew/types";

/**
 * Homebrew ids are name slugs scoped to the homebrew table: `Azureborn` →
 * `homebrew:azureborn`. See CONTEXT.md § Catalog reference.
 */

/** Straight, curly and backtick — all three read as apostrophes in a name. */
const APOSTROPHES = /['‘’ʼ`]/g;

const NON_SLUG = /[^a-z0-9]+/g;

const EDGE_SEPARATORS = /^-+|-+$/g;

/**
 * A name as an id. The apostrophe pass runs FIRST and deletes rather than
 * separates: upstream slugs `Healer's Kit` to `healers-kit`, and a
 * `healer-s-kit` sitting beside it in the same picker looks like a duplicate
 * nobody can tell apart.
 *
 * Accents are folded rather than dropped, so `Élan` keeps its letters.
 *
 * Returns `""` when nothing sluggable survives — a value the caller refuses
 * rather than storing an entry under a blank id.
 */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      // Combining marks, left behind by NFD. Folding beats stripping: `Élan`
      // becomes `elan`, not `lan`.
      .replace(/\p{Diacritic}/gu, "")
      .replace(APOSTROPHES, "")
      .toLowerCase()
      .replace(NON_SLUG, "-")
      .replace(EDGE_SEPARATORS, "")
  );
}

/**
 * A slug free within its type, suffixing `-2`, `-3`, … on collision.
 *
 * Scoped to the ONE homebrew table: a race and a spell may share a name, and
 * the catalog is a different namespace entirely — `catalog:human` and
 * `homebrew:human` coexist because the prefix disambiguates them.
 *
 * `keep` is the index an edit already owns, so re-saving an entry under its
 * own name does not walk it to `azureborn-2`.
 *
 * Returns `null` for a name that slugs to nothing.
 */
export async function uniqueSlug(
  type: HomebrewType,
  name: string,
  db: SheetcraftDb = getDb(),
  keep?: string,
): Promise<string | null> {
  const base = slugify(name);
  if (base === "") {
    return null;
  }

  const table = db.table(tableFor(type));

  for (let suffix = 1; ; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    if (candidate === keep) {
      return candidate;
    }
    if ((await table.get(candidate)) === undefined) {
      return candidate;
    }
  }
}
