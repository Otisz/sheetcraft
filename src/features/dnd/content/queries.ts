import { useQuery } from "@tanstack/react-query";
import {
  loadClassOptions,
  loadRaceOptions,
  loadSubclassOptions,
  loadSubraceOptions,
  type PickerOption,
} from "@/features/dnd/content/options";
import type { Ref } from "@/features/dnd/db/schema";

/**
 * What the content pickers read. Shared by character creation and by homebrew
 * authoring — both offer "choose a race", and both must offer the same list,
 * homebrew included.
 *
 * Dexie is reached only from inside these callbacks — never at module scope —
 * because `/dnd` routes are `ssr: false` for *rendering* only and their
 * modules still evaluate on the server. See `routes/dnd/route.tsx`.
 *
 * The stale time is infinite: the catalog changes only on a re-seed, and the
 * one writer of homebrew invalidates these keys itself.
 */

const FOREVER = Number.POSITIVE_INFINITY;

export const contentKeys = {
  all: ["dnd", "content"] as const,
  classes: () => [...contentKeys.all, "classes"] as const,
  races: () => [...contentKeys.all, "races"] as const,
  subclasses: (classRef: Ref | null) => [...contentKeys.all, "subclasses", classRef] as const,
  subraces: (raceRef: Ref | null) => [...contentKeys.all, "subraces", raceRef] as const,
};

export function useClassOptions() {
  return useQuery<PickerOption[]>({
    queryKey: contentKeys.classes(),
    queryFn: () => loadClassOptions(),
    staleTime: FOREVER,
  });
}

export function useRaceOptions() {
  return useQuery<PickerOption[]>({
    queryKey: contentKeys.races(),
    queryFn: () => loadRaceOptions(),
    staleTime: FOREVER,
  });
}

export function useSubclassOptions(classRef: Ref | null) {
  return useQuery<PickerOption[]>({
    queryKey: contentKeys.subclasses(classRef),
    queryFn: () => loadSubclassOptions(classRef),
    enabled: classRef !== null,
    staleTime: FOREVER,
  });
}

export function useSubraceOptions(raceRef: Ref | null) {
  return useQuery<PickerOption[]>({
    queryKey: contentKeys.subraces(raceRef),
    queryFn: () => loadSubraceOptions(raceRef),
    enabled: raceRef !== null,
    staleTime: FOREVER,
  });
}
