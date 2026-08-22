/**
 * The characters feature's public surface. Import from here, not from the
 * modules behind it — the split between the projection, the query layer and
 * the list component is free to move.
 */

export { CharacterList } from "@/features/dnd/characters/character-list";
export { useCharacter } from "@/features/dnd/characters/queries";
