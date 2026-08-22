import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { characterKeys } from "@/features/dnd/characters/queries";
import {
  loadClassOptions,
  loadRaceOptions,
  loadSubclassOptions,
  loadSubraceOptions,
  type PickerOption,
} from "@/features/dnd/creation/options";
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
 * Everything here reads catalog tables, which the sync gate has already
 * installed and which change only on a re-seed, so nothing goes stale behind
 * our back and the stale time is infinite.
 */

const FOREVER = Number.POSITIVE_INFINITY;

export const creationKeys = {
  all: ["dnd", "creation"] as const,
  classes: () => [...creationKeys.all, "classes"] as const,
  races: () => [...creationKeys.all, "races"] as const,
  subclasses: (classRef: Ref | null) => [...creationKeys.all, "subclasses", classRef] as const,
  subraces: (raceRef: Ref | null) => [...creationKeys.all, "subraces", raceRef] as const,
  subclassLevel: (classRef: Ref | null) => [...creationKeys.all, "subclass-level", classRef] as const,
};

export function useClassOptions() {
  return useQuery<PickerOption[]>({
    queryKey: creationKeys.classes(),
    queryFn: () => loadClassOptions(),
    staleTime: FOREVER,
  });
}

export function useRaceOptions() {
  return useQuery<PickerOption[]>({
    queryKey: creationKeys.races(),
    queryFn: () => loadRaceOptions(),
    staleTime: FOREVER,
  });
}

export function useSubclassOptions(classRef: Ref | null) {
  return useQuery<PickerOption[]>({
    queryKey: creationKeys.subclasses(classRef),
    queryFn: () => loadSubclassOptions(classRef),
    enabled: classRef !== null,
    staleTime: FOREVER,
  });
}

export function useSubraceOptions(raceRef: Ref | null) {
  return useQuery<PickerOption[]>({
    queryKey: creationKeys.subraces(raceRef),
    queryFn: () => loadSubraceOptions(raceRef),
    enabled: raceRef !== null,
    staleTime: FOREVER,
  });
}

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
