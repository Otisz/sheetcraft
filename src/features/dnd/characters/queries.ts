import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CharacterSummary } from "@/features/dnd/characters/list";
import { listCharacterSummaries } from "@/features/dnd/characters/list";
import { renameCharacter } from "@/features/dnd/characters/rename";
import { deleteCharacter, getCharacter } from "@/features/dnd/db/characters-repository";
import type { CharacterRecord } from "@/features/dnd/db/schema";

/**
 * The query layer over the character repository. Dexie is only ever reached
 * from inside these callbacks — never at module scope — because `/dnd` routes
 * are `ssr: false` for *rendering* only and their modules still evaluate on
 * the server. See docs/adr/0003-spa-shell-and-prerender.md.
 */

export const characterKeys = {
  all: ["dnd", "characters"] as const,
  list: () => [...characterKeys.all, "list"] as const,
  one: (id: string) => [...characterKeys.all, "one", id] as const,
};

export function useCharacterList() {
  return useQuery<CharacterSummary[]>({
    queryKey: characterKeys.list(),
    queryFn: () => listCharacterSummaries(),
    // The local database is the only writer, and every writer here
    // invalidates. Nothing goes stale behind our back.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * One character by id. `null` rather than `undefined` for a miss: a bookmarked
 * id outlives the character it names, and Query treats an `undefined` return
 * as a bug rather than as data.
 */
export function useCharacter(id: string) {
  return useQuery<CharacterRecord | null>({
    queryKey: characterKeys.one(id),
    queryFn: () => getCharacter(id).then((one) => one ?? null),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useRenameCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameCharacter(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: characterKeys.all }),
  });
}

export function useDeleteCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCharacter(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: characterKeys.all }),
  });
}
