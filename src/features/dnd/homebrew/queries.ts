import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { characterKeys } from "@/features/dnd/characters/queries";
import { contentKeys } from "@/features/dnd/content";
import type { HomebrewEntry } from "@/features/dnd/db/schema";
import { parentSourceOf } from "@/features/dnd/homebrew/references";
import type { DeleteResult, HomebrewGroup, SaveResult } from "@/features/dnd/homebrew/repository";
import {
  deleteHomebrewEntry,
  getHomebrewEntry,
  listHomebrewLibrary,
  saveHomebrewEntry,
} from "@/features/dnd/homebrew/repository";
import type { HomebrewType } from "@/features/dnd/homebrew/types";
import { HOMEBREW_SPECS } from "@/features/dnd/homebrew/types";

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
  /** The entry plus what loading it for editing needs beyond the row itself. */
  forEditing: (type: HomebrewType, index: string) => [...homebrewKeys.all, "editing", type, index] as const,
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
 *
 * A blank index means the caller is creating rather than editing, and the
 * query is disabled — there is nothing to look up, and firing the read anyway
 * would put a permanent miss in the cache under a key that means "no entry".
 */
export function useHomebrewEntry(type: HomebrewType, index: string) {
  return useQuery<HomebrewEntry | null>({
    queryKey: homebrewKeys.one(type, index),
    queryFn: () => getHomebrewEntry(type, index).then((one) => one ?? null),
    enabled: index !== "",
  });
}

/**
 * Invalidates everything a homebrew write can have moved.
 *
 * The **content keys** are in the list because the pickers read both tables
 * — a new race that does not appear in the picker until a reload is a race the
 * author concludes did not save. The **character keys** are there because an
 * edit applies live: a character referencing the entry derives differently the
 * moment it changes.
 */
function useInvalidateAfterWrite() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: homebrewKeys.all });
    void queryClient.invalidateQueries({ queryKey: contentKeys.all });
    void queryClient.invalidateQueries({ queryKey: characterKeys.all });
  };
}

/**
 * An entry loaded for editing: the row, plus which table its parent lives in.
 *
 * The parent source is not on the row and cannot be — upstream stores a parent
 * as a bare index, so the string alone cannot say which table it addresses.
 * Resolving it here means the form opens with the parent actually selected,
 * including the homebrew-subrace-of-a-homebrew-race case.
 */
export type EntryForEditing = {
  entry: HomebrewEntry;
  parentSource: "catalog" | "homebrew";
};

export function useHomebrewEntryForEditing(type: HomebrewType, index: string) {
  return useQuery<EntryForEditing | null>({
    queryKey: homebrewKeys.forEditing(type, index),
    queryFn: async () => {
      const entry = await getHomebrewEntry(type, index);
      if (!entry) {
        return null;
      }

      const parentType = HOMEBREW_SPECS[type].parentType;
      if (!parentType) {
        return { entry, parentSource: "catalog" };
      }

      const parentIndex = (entry[parentType === "races" ? "race" : "class"] as { index?: unknown } | undefined)?.index;
      return {
        entry,
        parentSource: await parentSourceOf(parentType, typeof parentIndex === "string" ? parentIndex : ""),
      };
    },
    enabled: index !== "",
  });
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
