import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { characterKeys } from "@/features/dnd/characters/queries";
import { creationKeys } from "@/features/dnd/creation/queries";
import type { HomebrewEntry } from "@/features/dnd/db/schema";
import type { DeleteResult, HomebrewGroup, SaveResult } from "@/features/dnd/homebrew/repository";
import {
  deleteHomebrewEntry,
  getHomebrewEntry,
  listHomebrewLibrary,
  saveHomebrewEntry,
} from "@/features/dnd/homebrew/repository";
import type { HomebrewType } from "@/features/dnd/homebrew/types";

/**
 * The query layer over the homebrew repository. Dexie is reached only from
 * inside these callbacks — never at module scope — because `/dnd` routes are
 * `ssr: false` for *rendering* only and their modules still evaluate on the
 * server. See `routes/dnd/route.tsx`.
 *
 * Unlike the catalog, homebrew has a writer sitting right here, so the stale
 * time is not infinite by default — every mutation invalidates instead.
 */

export const homebrewKeys = {
  all: ["dnd", "homebrew"] as const,
  library: () => [...homebrewKeys.all, "library"] as const,
  one: (type: HomebrewType, index: string) => [...homebrewKeys.all, "one", type, index] as const,
};

export function useHomebrewLibrary() {
  return useQuery<HomebrewGroup[]>({
    queryKey: homebrewKeys.library(),
    queryFn: () => listHomebrewLibrary(),
  });
}

/**
 * One entry by type and index. `null` rather than `undefined` for a miss: a
 * bookmarked edit URL outlives the entry it names, and Query treats an
 * `undefined` return as a bug rather than as data.
 */
export function useHomebrewEntry(type: HomebrewType, index: string) {
  return useQuery<HomebrewEntry | null>({
    queryKey: homebrewKeys.one(type, index),
    queryFn: () => getHomebrewEntry(type, index).then((one) => one ?? null),
  });
}

/**
 * Invalidates everything a homebrew write can have moved.
 *
 * The **creation keys** are in the list because the pickers read both tables
 * — a new race that does not appear in the picker until a reload is a race the
 * author concludes did not save. The **character keys** are there because an
 * edit applies live: a character referencing the entry derives differently the
 * moment it changes.
 */
function useInvalidateAfterWrite() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: homebrewKeys.all });
    void queryClient.invalidateQueries({ queryKey: creationKeys.all });
    void queryClient.invalidateQueries({ queryKey: characterKeys.all });
  };
}

export type SaveVariables = {
  type: HomebrewType;
  candidate: Record<string, unknown>;
  /** Present when editing; absent when creating. */
  existingIndex?: string;
};

/**
 * Saving. A validation failure comes back as a **resolved** `SaveResult`, not
 * a rejection: an invalid entry is an expected outcome of a form, and routing
 * it through `onError` would put it in the same channel as a storage fault.
 */
export function useSaveHomebrew() {
  const invalidate = useInvalidateAfterWrite();

  return useMutation<SaveResult, Error, SaveVariables>({
    mutationFn: ({ type, candidate, existingIndex }) => saveHomebrewEntry(type, candidate, existingIndex),
    onSuccess: (result) => {
      if (result.ok) {
        invalidate();
      }
    },
  });
}

export type DeleteVariables = { type: HomebrewType; index: string };

/** Deleting. A refusal, like a validation failure, resolves rather than rejects. */
export function useDeleteHomebrew() {
  const invalidate = useInvalidateAfterWrite();

  return useMutation<DeleteResult, Error, DeleteVariables>({
    mutationFn: ({ type, index }) => deleteHomebrewEntry(type, index),
    onSuccess: (result) => {
      if (result.ok) {
        invalidate();
      }
    },
  });
}
