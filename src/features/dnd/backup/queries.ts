import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
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
  /** The raw timestamp, which the stale banner compares against the last edit. */
  lastExportedAt: Date | null;
};

export function useDurability() {
  return useQuery<DurabilityState>({
    queryKey: backupKeys.durability(),
    queryFn: async () => {
      const lastExportedAt = await readLastExportedAt();
      return { installed: isStandalone(), age: backupAge(lastExportedAt), lastExportedAt };
    },
  });
}

/**
 * Running an export.
 *
 * **The shape of this hook is decided entirely by transient activation.** Web
 * Share requires it (spec step 6), and it is consumed by the first `await` in
 * the tap handler's call stack — so a handler that reads IndexedDB and *then*
 * calls `share()` gets `NotAllowedError`, and the user gets nothing.
 *
 * The fix is to have the data **before** the tap. `useExportBackup` keeps the
 * backup prepared in a query, refreshed whenever the characters change, and
 * `share` is a plain synchronous function that reads that cache and calls
 * `deliverBackup` with a `File` built on the spot. Nothing is awaited between
 * the tap and `share()`.
 *
 * The stamping and invalidation that follow are deliberately fired off the
 * returned promise rather than awaited before delivery — they are bookkeeping,
 * and putting them first would reintroduce the very await this exists to avoid.
 */
export type ExportOutcome = { outcome: DeliveryOutcome; filename: string };

/** The backup, kept warm so a tap never has to wait for IndexedDB. */
function usePreparedBackup(characterId?: string) {
  return useQuery({
    queryKey: [...backupKeys.all, "prepared", characterId ?? "all"] as const,
    queryFn: () => collectBackup(characterId),
    // Rebuilt on demand rather than served stale: an export must contain what
    // the database holds NOW, and a backup missing the last ten minutes of play
    // is the kind of wrong nobody notices until they need it.
    gcTime: 0,
    staleTime: 0,
  });
}

export type ExportController = {
  /** Synchronous, and safe to call straight from `onClick`. */
  share: () => void;
  /** False while the backup is still being prepared — the button waits, the tap does not. */
  ready: boolean;
  pending: boolean;
  error: boolean;
  result: ExportOutcome | null;
};

export function useExportBackup({
  characterId,
  characterName,
}: {
  characterId?: string;
  characterName?: string;
} = {}): ExportController {
  const queryClient = useQueryClient();
  const prepared = usePreparedBackup(characterId);
  const [result, setResult] = useState<ExportOutcome | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const share = useCallback(() => {
    const file = prepared.data;
    if (!file) {
      return;
    }

    const filename = backupFilename(new Date(file.exportedAt), characterName);
    setPending(true);
    setError(false);

    // Built and handed over synchronously: this is the same call stack the tap
    // started, with no `await` in front of it, so the activation is intact.
    let delivery: Promise<DeliveryOutcome>;
    try {
      delivery = deliverBackup(backupFile(file, filename));
    } catch {
      setPending(false);
      setError(true);
      return;
    }

    void delivery
      .then(async (outcome) => {
        setResult({ outcome, filename });

        // A cancelled share is not a backup. Stamping it would tell the user
        // their data is safe when no file was ever written anywhere.
        if (outcome !== "cancelled") {
          await recordExport();
          void queryClient.invalidateQueries({ queryKey: backupKeys.durability() });
        }

        // Opportunistic and never surfaced: a `false` is normal on iOS in a tab
        // and not actionable. See CONTEXT.md § Installed.
        void requestPersistence();
      })
      .catch(() => setError(true))
      .finally(() => setPending(false));
  }, [prepared.data, characterName, queryClient]);

  return { share, ready: prepared.data !== undefined, pending, error, result };
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
      // Including the prepared backup: it is a snapshot, and one taken before
      // an import would export the database as it was.
      void queryClient.invalidateQueries({ queryKey: backupKeys.all });
    },
  });
}
