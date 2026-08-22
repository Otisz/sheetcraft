import { refIndex } from "@/features/dnd/db/resolve-ref";
import type { Ref } from "@/features/dnd/db/schema";

/**
 * The formatting the sheet's components share.
 *
 * Small, but not inlined: `signed` had already reached two copies across the
 * sheet before the tabs added six more places that need it, and a sheet where
 * one modifier reads `+3` and another reads `3` is a sheet a player has to
 * squint at.
 */

/** A modifier reads `+3` or `-1`; a bare `3` is ambiguous on a character sheet. */
export function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

/**
 * The words that stay lowercase inside a name — `Sleight of Hand`, not
 * `Sleight Of Hand`. Only ever applied mid-name; a leading word is always
 * capitalised.
 */
const MINOR_WORDS = new Set(["of", "the", "and", "in", "on"]);

/**
 * `animal-handling` → `Animal Handling`, `sleight-of-hand` → `Sleight of Hand`.
 *
 * The SRD's index convention made readable. The minor-word rule is not
 * pedantry: `Sleight Of Hand` is not what the skill is called, and the sheet is
 * read next to a rulebook that spells it correctly.
 */
export function titleCase(index: string): string {
  return index
    .split("-")
    .map((word, position) =>
      position > 0 && MINOR_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/**
 * The display name for a ref, falling back to the ⚠ marker when it has not
 * resolved.
 *
 * One helper rather than the same `names[ref] ?? unknownRefLabel(refIndex(ref))`
 * at each of the four tabs that show refs: the fallback is a decision about how
 * the sheet admits ignorance, and four copies is four chances to admit it
 * differently.
 */
export function nameFor(names: Partial<Record<string, string>>, ref: Ref): string {
  return names[ref] ?? unknownRefLabel(refIndex(ref));
}

/**
 * How an unresolvable ref reads. A ref can dangle after an upstream re-seed, and
 * the index is still information — more than a blank row, and honest about the
 * fact that something is missing rather than pretending the entry is nameless.
 */
export function unknownRefLabel(index: string | null): string {
  return `⚠ unknown (${index ?? "malformed ref"})`;
}
