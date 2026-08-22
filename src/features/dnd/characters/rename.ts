import { updateCharacter } from "@/features/dnd/db/characters-repository";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import type { CharacterRecord } from "@/features/dnd/db/schema";

/**
 * The one rule a rename has: a character must keep a name. Surrounding
 * whitespace is a typo, interior spacing is a choice — only the former is
 * touched.
 *
 * Returns `null` for a name that is nothing but whitespace, which is what the
 * form disables its submit on.
 */
export function normalizeCharacterName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Applies a rename. Returns the stored record, or `undefined` when the name
 * was blank or the character is already gone — neither is an exception. A
 * blank rename being a silent no-op is deliberate: a lost name cannot be
 * recovered, and the caller already blocks the case in its UI.
 */
export async function renameCharacter(
  id: string,
  name: string,
  db: SheetcraftDb = getDb(),
): Promise<CharacterRecord | undefined> {
  const normalized = normalizeCharacterName(name);
  if (!normalized) {
    return undefined;
  }

  return updateCharacter(id, { name: normalized }, db);
}
