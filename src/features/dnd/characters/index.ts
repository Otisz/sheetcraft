/**
 * The characters feature's public surface. Import from here, not from the
 * modules behind it — the split between the projection, the query layer and
 * the list component is free to move.
 */

export { CharacterList } from "@/features/dnd/characters/character-list";
export type { CharacterSummary } from "@/features/dnd/characters/list";
export { listCharacterSummaries } from "@/features/dnd/characters/list";
export {
  characterKeys,
  useCharacterList,
  useDeleteCharacter,
  useRenameCharacter,
} from "@/features/dnd/characters/queries";
export { normalizeCharacterName, renameCharacter } from "@/features/dnd/characters/rename";
