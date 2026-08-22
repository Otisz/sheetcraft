import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { characterKeys } from "@/features/dnd/characters/queries";
import { subclassLevel } from "@/features/dnd/creation/subclass-timing";
import type { CreateCharacterInput } from "@/features/dnd/db/characters-repository";
import { createCharacter } from "@/features/dnd/db/characters-repository";
import type { Ref } from "@/features/dnd/db/schema";

/**
 * The query layer for creation. Dexie is reached only from inside these
 * callbacks — never at module scope — because `/dnd` routes are `ssr: false`
 * for *rendering* only and their modules still evaluate on the server. See
 * `routes/dnd/route.tsx`.
 *
 * The picker option reads live in `features/dnd/content`, which homebrew
 * authoring shares — both surfaces offer "choose a race" and must offer the
 * same list.
 */

const FOREVER = Number.POSITIVE_INFINITY;

export const creationKeys = {
  all: ["dnd", "creation"] as const,
  subclassLevel: (classRef: Ref | null) => [...creationKeys.all, "subclass-level", classRef] as const,
};

/**
 * The chosen class's subclass threshold. `undefined` while it loads — which
 * the form treats as "not known yet" and therefore hides the field, rather
 * than flashing a required field that may not be required.
 */
export function useSubclassLevel(classRef: Ref | null) {
  return useQuery<number | null>({
    queryKey: creationKeys.subclassLevel(classRef),
    queryFn: () => subclassLevel(classRef as Ref),
    enabled: classRef !== null,
    staleTime: FOREVER,
  });
}

export function useCreateCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCharacterInput) => createCharacter(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: characterKeys.all }),
  });
}
