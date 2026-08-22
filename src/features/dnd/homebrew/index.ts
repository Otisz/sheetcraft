/**
 * The homebrew feature's public surface. Import from here, not from the
 * modules behind it — the split between the repository, the drafts and the
 * editing components is free to move.
 */

export { HomebrewEditor } from "@/features/dnd/homebrew/homebrew-editor";
export { HomebrewList } from "@/features/dnd/homebrew/homebrew-list";
export type { ReferencingCharacter } from "@/features/dnd/homebrew/references";
export { charactersReferencing } from "@/features/dnd/homebrew/references";
export type { DeleteResult, HomebrewGroup, SaveResult } from "@/features/dnd/homebrew/repository";
export {
  deleteHomebrewEntry,
  getHomebrewEntry,
  listHomebrewEntries,
  listHomebrewLibrary,
  saveHomebrewEntry,
} from "@/features/dnd/homebrew/repository";
export { slugify, uniqueSlug } from "@/features/dnd/homebrew/slug";
export type { AuthoringTier, HomebrewType } from "@/features/dnd/homebrew/types";
export { HOMEBREW_TYPE_ORDER, HOMEBREW_TYPES, isHomebrewType } from "@/features/dnd/homebrew/types";
export type { ValidationIssue, ValidationResult } from "@/features/dnd/homebrew/validate";
export { parseHomebrewJson, validateEntry } from "@/features/dnd/homebrew/validate";
