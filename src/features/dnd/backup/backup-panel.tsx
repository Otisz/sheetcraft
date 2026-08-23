import { AlertTriangle, Check, Download, Share, Smartphone, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { BackupAge } from "@/features/dnd/backup/durability";
import type { BackupFile } from "@/features/dnd/backup/format";
import type { ParseResult } from "@/features/dnd/backup/parse";
import { useDurability, useExportBackup, useImportBackup, useReadBackupFile } from "@/features/dnd/backup/queries";
import { THUMB_ACTION } from "@/lib/utils";

/**
 * The durability surface: one honest statement of what is true now, and the
 * two actions that change it.
 *
 * `persist()` is deliberately absent from this panel. It is called
 * opportunistically on export, but a `false` return is *normal* on iOS Safari
 * in a tab and is **not actionable by the user** — showing it would send
 * somebody chasing a setting they cannot change. See CONTEXT.md § Installed.
 */

/** How the backup's age reads. `never` is its own sentence, not an old date. */
export function backupAgeLabel(age: BackupAge): string {
  if (age.state === "never") {
    return "Never backed up";
  }
  if (age.days === 0) {
    return "Backed up today";
  }
  return age.days === 1 ? "Backed up yesterday" : `Backed up ${age.days} days ago`;
}

export function BackupPanel({ characterCount }: { characterCount: number }) {
  const durability = useDurability();
  const [importing, setImporting] = useState(false);

  if (!durability.data) {
    return null;
  }

  const { installed, age } = durability.data;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Data durability</h2>

      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex items-center gap-2">
          {installed ? (
            <Check className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Smartphone className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className={installed ? undefined : "text-muted-foreground"}>
            {installed ? "Installed to Home Screen" : "Running in a browser tab"}
          </span>
        </li>
        <li className="flex items-center gap-2">
          {age.state === "fresh" ? (
            <Check className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          )}
          <span className={age.state === "fresh" ? undefined : "font-medium"}>{backupAgeLabel(age)}</span>
        </li>
      </ul>

      <div className="flex flex-col gap-2 pt-1">
        <ExportButton label={characterCount === 0 ? "Back up everything" : `Back up everything (${characterCount})`} />
        <Button variant="outline" size="lg" className={THUMB_ACTION} onClick={() => setImporting(true)}>
          <Upload />
          Restore from a backup
        </Button>
      </div>

      {importing ? <ImportDrawer onClose={() => setImporting(false)} /> : null}
    </section>
  );
}

/**
 * The export tap.
 *
 * `share()` is **synchronous and awaits nothing** — Web Share needs transient
 * activation, and the first `await` in the handler's call stack consumes it,
 * which is why the backup is prepared ahead of the tap rather than read inside
 * it. The button stays disabled until it is ready. See `useExportBackup`.
 */
export function ExportButton({
  label,
  characterId,
  characterName,
  variant = "default",
  onDone,
}: {
  label: string;
  characterId?: string;
  characterName?: string;
  variant?: "default" | "outline";
  onDone?: () => void;
}) {
  const exportBackup = useExportBackup({ characterId, characterName });

  return (
    <>
      <Button
        variant={variant}
        size="lg"
        className={THUMB_ACTION}
        // Disabled until the backup is prepared, so the tap itself never waits
        // on IndexedDB — that await is what would consume the transient
        // activation Web Share needs. See `useExportBackup`.
        disabled={!exportBackup.ready || exportBackup.pending}
        onClick={() => {
          exportBackup.share();
          onDone?.();
        }}
      >
        <Share />
        {exportBackup.pending ? "Preparing…" : label}
      </Button>

      {/*
        A cancelled share says nothing — the user closed the sheet, and
        answering their choice with a message is noise. Everything else is
        reported, because a backup you are not sure happened is not a backup.
      */}
      {exportBackup.error ? (
        <p role="alert" className="text-sm text-destructive">
          That backup could not be written. Nothing has been lost — try again.
        </p>
      ) : null}
      {exportBackup.result?.outcome === "downloaded" ? (
        <p aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Download className="size-4 shrink-0" />
          Saved as {exportBackup.result.filename}
        </p>
      ) : null}
      {exportBackup.result?.outcome === "shared" ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          Backup shared.
        </p>
      ) : null}
    </>
  );
}

/**
 * Import, in two steps: read the file, then show what it holds before writing
 * anything. The preview is the point — an import cannot be undone, so the user
 * sees "3 characters, 2 homebrew races" before it lands.
 */
function ImportDrawer({ onClose }: { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const read = useReadBackupFile();
  const write = useImportBackup();
  const [file, setFile] = useState<BackupFile | null>(null);

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      showSwipeHandle
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Restore from a backup</DrawerTitle>
          <DrawerDescription>
            Importing always adds copies. Nothing already on this device is changed or replaced.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pt-2">
          {/*
            Both the extension and the MIME type, per MDN's explicit
            recommendation — and `accept` is a hint, never validation, so the
            content is parsed and checked after reading regardless.
          */}
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              // Cleared immediately: a file input fires no `change` when the
              // same file is picked twice, so somebody who picks the wrong
              // file, fixes it, and picks the same NAME again would tap and
              // get nothing at all.
              event.target.value = "";
              setFile(null);
              if (chosen) {
                read.mutate(chosen, {
                  onSuccess: (result) => setFile(result.ok ? result.file : null),
                });
              }
            }}
          />

          {file ? <ImportPreview file={file} /> : null}
          {read.data && !read.data.ok ? <ImportRefusal result={read.data} /> : null}
          {write.isError ? (
            <p role="alert" className="text-sm text-destructive">
              That backup could not be written. Nothing was imported.
            </p>
          ) : null}
          {write.data ? (
            <p aria-live="polite" className="text-sm">
              Imported {countLabel(write.data.characters, "character")}
              {write.data.homebrew > 0
                ? ` and ${countLabel(write.data.homebrew, "homebrew entry", "homebrew entries")}`
                : ""}
              .
            </p>
          ) : null}
        </div>

        <DrawerFooter className="pt-4">
          {file && !write.data ? (
            <Button size="lg" className={THUMB_ACTION} disabled={write.isPending} onClick={() => write.mutate(file)}>
              {write.isPending ? "Importing…" : "Import"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="lg"
              className={THUMB_ACTION}
              disabled={read.isPending}
              onClick={() => input.current?.click()}
            >
              {read.isPending ? "Reading…" : "Choose a file"}
            </Button>
          )}
          <DrawerClose render={<Button variant="ghost" size="lg" className={THUMB_ACTION} />}>
            {write.data ? "Done" : "Cancel"}
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** `3 characters` / `1 character` — pluralised where the count is user-facing. */
function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** What is in the file, before it is written. */
function ImportPreview({ file }: { file: BackupFile }) {
  const homebrew = Object.values(file.homebrew).reduce((total, entries) => total + entries.length, 0);

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm">
      <p className="font-medium">
        {countLabel(file.characters.length, "character")}
        {homebrew > 0 ? `, ${countLabel(homebrew, "homebrew entry", "homebrew entries")}` : ""}
      </p>
      <p className="text-muted-foreground">
        {file.characters.map((character) => character.name).join(", ") || "This backup is empty."}
      </p>
    </div>
  );
}

/**
 * A refusal, said in the terms the user can act on. The four reasons offer four
 * different next steps, which is why they are not collapsed into "invalid file".
 */
function ImportRefusal({ result }: { result: Extract<ParseResult, { ok: false }> }) {
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/50 p-3 text-sm">
      <p className="font-medium">{result.message}</p>
      {result.reason === "newer-format" ? (
        <p className="text-muted-foreground">Update Sheetcraft and try again. Your file is unchanged.</p>
      ) : null}
      {result.reason === "not-a-backup" ? (
        <p className="text-muted-foreground">Pick the .json file a Sheetcraft backup produced.</p>
      ) : null}
    </div>
  );
}
