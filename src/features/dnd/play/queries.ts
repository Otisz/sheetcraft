import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { characterKeys } from "@/features/dnd/characters/queries";
import { updateCharacter } from "@/features/dnd/db/characters-repository";
import type { CharacterRecord, Modifier, PlayState } from "@/features/dnd/db/schema";
import type { DeriveContext } from "@/features/dnd/derive";
import { loadDeriveContext } from "@/features/dnd/play/sheet-context";
import type { TabData } from "@/features/dnd/play/tab-data";
import { loadTabData } from "@/features/dnd/play/tab-data";

/**
 * The query layer for play mode. Dexie is reached only from inside these
 * callbacks — never at module scope — because `/dnd` routes are `ssr: false`
 * for *rendering* only and their modules still evaluate on the server. See
 * `routes/dnd/route.tsx`.
 *
 * Play state changes constantly, so every mutation here invalidates the
 * character. The derive context does not: it depends on catalog rows and on
 * the character's equipment, neither of which a play-state write touches.
 */

const FOREVER = Number.POSITIVE_INFINITY;

export const playKeys = {
  all: ["dnd", "play"] as const,
  context: (id: string) => [...playKeys.all, "context", id] as const,
  tabData: (id: string) => [...playKeys.all, "tab-data", id] as const,
};

/**
 * The resolved catalog data this character's derivation needs.
 *
 * Keyed on the character id and invalidated with it, because equipping armor
 * changes the context and equipping is a character write. The catalog half
 * changes only on a re-seed, which reloads the app.
 */
export function useDeriveContext(character: CharacterRecord | null | undefined) {
  return useQuery<DeriveContext>({
    queryKey: playKeys.context(character?.id ?? "none"),
    queryFn: () => loadDeriveContext(character as CharacterRecord),
    enabled: Boolean(character),
    staleTime: FOREVER,
  });
}

/**
 * The display names and feature prose the six tabs render.
 *
 * A separate query from `useDeriveContext` rather than a widening of it,
 * because they have different urgency: the derive context is on the path to
 * first paint, while a name behind a tab can arrive a moment later. Merging
 * them would put a feature-table scan in front of the HP row.
 *
 * Keyed and invalidated on the character for the same reason the context is —
 * adding an item changes what needs naming.
 */
export function useTabData(character: CharacterRecord | null | undefined) {
  return useQuery<TabData>({
    queryKey: playKeys.tabData(character?.id ?? "none"),
    queryFn: () => loadTabData(character as CharacterRecord),
    enabled: Boolean(character),
    staleTime: FOREVER,
  });
}

/**
 * Writes a slice of play state. Takes the whole `play` object rather than a
 * patch path: the record stores play state as one nested object, and Dexie's
 * `put` writes the record whole anyway.
 */
export function useUpdatePlay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, play }: { id: string; play: PlayState }) => updateCharacter(id, { play }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: characterKeys.all }),
  });
}

/**
 * Writes the modifier list — what toggling an effect and clearing an override
 * both come down to.
 *
 * Modifiers live on character data rather than in `play`, even though the
 * `enabled` flag is play state, because a modifier record is one record: its
 * target and value are character data and splitting the flag out would put one
 * concept in two places. See CONTEXT.md § Toggle.
 *
 * This invalidates the derive context too — flipping Unarmored Defense has to
 * move AC, and that is the point of the toggle.
 */
export function useUpdateModifiers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, modifiers }: { id: string; modifiers: Modifier[] }) => updateCharacter(id, { modifiers }),
    onSuccess: (_result, { id }) => {
      void queryClient.invalidateQueries({ queryKey: characterKeys.all });
      void queryClient.invalidateQueries({ queryKey: playKeys.context(id) });
      // The tabs name what the character carries, so an equipment change moves
      // this too — a stale name outlives the item it named.
      void queryClient.invalidateQueries({ queryKey: playKeys.tabData(id) });
    },
  });
}
