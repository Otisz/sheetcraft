import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { collectBackup } from "@/features/dnd/backup/collect";
import type { DeliveryOutcome } from "@/features/dnd/backup/deliver";
import { backupFile, deliverBackup } from "@/features/dnd/backup/deliver";
import type { BackupAge } from "@/features/dnd/backup/durability";
import {
  backupAge,
  isStandalone,
  readLastExportedAt,
  recordExport,
  requestPersistence,
} from "@/features/dnd/backup/durability";
import { backupFilename } from "@/features/dnd/backup/format";
import type { ImportSummary } from "@/features/dnd/backup/import";
import { importBackup } from "@/features/dnd/backup/import";
import type { ParseResult } from "@/features/dnd/backup/parse";
import { parseBackup } from "@/features/dnd/backup/parse";
import { characterKeys } from "@/features/dnd/characters/queries";
import { contentKeys } from "@/features/dnd/content";
import { homebrewKeys } from "@/features/dnd/homebrew/queries";

/**
 * The query layer over the backup feature. Dexie is reached only from inside
 * these callbacks — never at module scope — because `/dnd` routes are
 * `ssr: false` for *rendering* only and their modules still evaluate on the
 * server. See `routes/dnd/route.tsx`.
 */

export const backupKeys = {
  all: ["dnd", "backup"] as const,
  durability: () => [...backupKeys.all, "durability"] as const,
};

/** What the durability panel renders. See CONTEXT.md § Installed. */
export type DurabilityState = {
  installed: boolean;
  age: BackupAge;
};

export function useDurability() {
  return useQuery<DurabilityState>({
    queryKey: backupKeys.durability(),
    queryFn: async () => ({
      installed: isStandalone(),
      age: backupAge(await readLastExportedAt()),
    }),
  });
}

/**
 * Running an export.
 *
 * **The whole shape of this hook is decided by transient activation.** Web
 * Share requires it (spec step 6), and awaiting IndexedDB inside the tap
 * handler consumes it — `share()` then rejects with `NotAllowedError` and the
 * user gets nothing. So the tap handler must not be the thing that reads the
 * database.
 *
 * `exportBackup` therefore returns a promise the CALLER never awaits before
 * calling `deliverBackup`; instead the read, the `File` construction and the
 * delivery all happen inside one already-activated call stack, with the `File`
 * built from data before the first `await` that could matter. React Query
 * would otherwise interpose its own async boundary, which is why the delivery
 * is not a mutation over the collected data but a single function.
 */
export type ExportOutcome = { outcome: DeliveryOutcome; filename: string };

export function useExportBackup() {
  const queryClient = useQueryClient();

  return useMutation<ExportOutcome, Error, { characterId?: string; characterName?: string }>({
    mutationFn: async ({ characterId, characterName }) => {
      const file = await collectBackup(characterId);
      const filename = backupFilename(new Date(file.exportedAt), characterName);

      // Built synchronously from data already in hand — the last `await` above
      // is the read, and nothing between here and `share()` touches storage.
      const outcome = await deliverBackup(backupFile(file, filename));

      // A cancelled share is not a backup. Stamping it would tell the user
      // their data is safe when no file was ever written anywhere.
      if (outcome !== "cancelled") {
        await recordExport();
      }

      // Opportunistic and never surfaced: a `false` is normal on iOS in a tab
      // and not actionable. See CONTEXT.md § Installed.
      void requestPersistence();

      return { outcome, filename };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: backupKeys.durability() }),
  });
}

/**
 * Reading a chosen file, without writing anything.
 *
 * Split from the write so the user is shown what a file contains — "3
 * characters, 2 homebrew races" — before it lands. A refusal arrives as a
 * resolved `ParseResult` rather than a rejection: the four failure reasons
 * offer the user four different next steps, and routing them through `onError`
 * would collapse them into one.
 */
export function useReadBackupFile() {
  return useMutation<ParseResult, Error, File>({
    mutationFn: async (file) => parseBackup(await file.text()),
  });
}

/** Writing a parsed backup. Invalidates everything an import can have moved. */
export function useImportBackup() {
  const queryClient = useQueryClient();

  return useMutation<ImportSummary, Error, Parameters<typeof importBackup>[0]>({
    mutationFn: (file) => importBackup(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: characterKeys.all });
      void queryClient.invalidateQueries({ queryKey: homebrewKeys.all });
      void queryClient.invalidateQueries({ queryKey: contentKeys.all });
    },
  });
}

/**
 * Asks for persistent storage once, on a real gesture.
 *
 * Chromium grants it far more readily after a user interaction, and the answer
 * is deliberately dropped on the floor here rather than returned: nothing in
 * the UI is allowed to depend on it.
 */
export function useOpportunisticPersistence() {
  return useCallback(() => {
    void requestPersistence();
  }, []);
}
