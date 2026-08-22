import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
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
import type { HomebrewEntry } from "@/features/dnd/db/schema";
import type { FormDraft } from "@/features/dnd/homebrew/drafts";
import { buildCandidate, draftFromEntry, emptyFormDraft } from "@/features/dnd/homebrew/drafts";
import { EntryForm } from "@/features/dnd/homebrew/entry-form";
import { IssueList, JsonEditor } from "@/features/dnd/homebrew/json-editor";
import { useDeleteHomebrew, useHomebrewEntry, useSaveHomebrew } from "@/features/dnd/homebrew/queries";
import type { ReferencingCharacter } from "@/features/dnd/homebrew/references";
import { HOMEBREW_TYPES, type HomebrewType } from "@/features/dnd/homebrew/types";
import type { ValidationIssue } from "@/features/dnd/homebrew/validate";
import { parseHomebrewJson } from "@/features/dnd/homebrew/validate";
import { cn, THUMB_ACTION } from "@/lib/utils";

/**
 * Authoring one entry, creating or editing.
 *
 * Two surfaces over the same save: the form for the type's own fields, and the
 * JSON editor, which every type has. The JSON editor is what makes "homebrew
 * uses the same schema as catalog" honest — a form covering only 15 of a
 * class's 190 leaves would otherwise be a quiet redefinition of what homebrew
 * is. See CONTEXT.md § Homebrew authoring tiers.
 */

/** Which surface is showing. A type with no form starts — and stays — on JSON. */
type Mode = "form" | "json";

export function HomebrewEditor({ type, index }: { type: HomebrewType; index?: string }) {
  // An edit reads the entry first; a create has nothing to read. The hook is
  // called either way and simply disabled, because hooks are not conditional.
  const existing = useHomebrewEntry(type, index ?? "");

  if (index === undefined) {
    return <Editor type={type} entry={null} />;
  }

  if (existing.isPending) {
    return <Pending />;
  }

  if (existing.data == null) {
    return <NotFound type={type} />;
  }

  return <Editor type={type} entry={existing.data} />;
}

function Editor({ type, entry }: { type: HomebrewType; entry: HomebrewEntry | null }) {
  const spec = HOMEBREW_TYPES[type];
  const navigate = useNavigate();
  const save = useSaveHomebrew();
  const editing = entry !== null;

  /**
   * A JSON-only type opens in the editor and has no form to switch to. Every
   * other type opens on its form, which is the surface it was given for a
   * reason.
   */
  const [mode, setMode] = useState<Mode>(spec.tier === "json" ? "json" : "form");

  const [draft, setDraft] = useState<FormDraft>(() => (entry ? draftFromEntry(type, entry) : emptyFormDraft(type)));
  /**
   * The JSON buffer, seeded from the stored entry rather than from the draft:
   * an edit must open showing what is actually stored, including the fields
   * the form does not have.
   */
  const [json, setJson] = useState<string>(() => (entry ? JSON.stringify(stripBookkeeping(entry), null, 2) : ""));

  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [affected, setAffected] = useState<ReferencingCharacter[] | null>(null);

  function submit() {
    const candidate = mode === "json" ? null : buildCandidate(type, draft);

    if (mode === "json") {
      // Validated here as well as in the repository, so a syntax error is
      // reported without a write being attempted at all.
      const parsed = parseHomebrewJson(type, json);
      if (!parsed.ok) {
        setIssues(parsed.issues);
        return;
      }
      commit(parsed.entry as unknown as Record<string, unknown>);
      return;
    }

    commit(candidate as Record<string, unknown>);
  }

  function commit(candidate: Record<string, unknown>) {
    save.mutate(
      { type, candidate, existingIndex: entry?.index },
      {
        onSuccess: (result) => {
          if (!result.ok) {
            setIssues(result.issues);
            return;
          }

          setIssues([]);

          // An edit that reached characters says so before leaving; nothing is
          // blocked, and the report exists so the change is not invisible.
          if (result.affected.length > 0) {
            setAffected(result.affected);
            return;
          }

          void navigate({ to: "/dnd/homebrew" });
        },
      },
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="flex flex-col gap-1 px-4 pt-6 pb-4">
        <Link to="/dnd/homebrew" className="flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="size-4" />
          Homebrew
        </Link>
        <h1 className="text-2xl font-bold">
          {editing ? "Edit" : "New"} {spec.label.toLowerCase()}
        </h1>
        {editing ? <p className="font-mono text-xs text-muted-foreground">homebrew:{entry.index}</p> : null}
      </header>

      <div className="flex flex-col gap-6 px-4 pb-32">
        {spec.tier === "json" ? (
          <JsonOnlyNote label={spec.plural} leaves={spec.leaves} />
        ) : (
          <ModeToggle mode={mode} onChange={setMode} />
        )}
        {spec.tier === "minimal-form" && mode === "form" ? <MinimalFormNote label={spec.label} /> : null}

        {mode === "form" ? (
          <>
            <EntryForm type={type} draft={draft} onChange={setDraft} />
            <IssueList issues={issues} />
          </>
        ) : (
          <JsonEditor value={json} onChange={setJson} issues={issues} />
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          <Button size="lg" className={THUMB_ACTION} disabled={save.isPending} onClick={submit}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          {editing ? <DeleteAction type={type} entry={entry} /> : null}
        </div>
      </div>

      {affected ? <AffectedDrawer affected={affected} onClose={() => void navigate({ to: "/dnd/homebrew" })} /> : null}
    </div>
  );
}

/**
 * The bookkeeping the JSON editor must not show. `updatedAt` is a `Date` the
 * repository re-stamps on every write; leaving it in the buffer would invite
 * someone to edit a field that is not theirs, and it fails the strict schema
 * on the way back in.
 */
function stripBookkeeping(entry: HomebrewEntry): Record<string, unknown> {
  const { updatedAt: _stamped, ...rest } = entry;
  return rest;
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {(["form", "json"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => onChange(option)}
          className={cn(
            "h-10 flex-1 rounded-md text-sm font-medium",
            mode === option ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          {option === "form" ? "Form" : "JSON"}
        </button>
      ))}
    </div>
  );
}

/**
 * Said plainly, with the number that decided it. "This type has no form" reads
 * as something missing; the leaf count reads as a decision.
 */
function JsonOnlyNote({ label, leaves }: { label: string; leaves: number }) {
  return (
    <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
      {label} have {leaves} fields nested several levels deep — too many for a form on a phone, so this type is written
      as JSON. It is the same shape the SRD uses.
    </p>
  );
}

function MinimalFormNote({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
      This is a short {label.toLowerCase()} form — name, parent class and features as prose. For anything it does not
      cover, switch to JSON.
    </p>
  );
}

/**
 * Deleting, with the block. The refusal names the characters rather than
 * counting them: a count leaves the user hunting, and the scan is a full scan
 * precisely so the answer can be trusted.
 */
function DeleteAction({ type, entry }: { type: HomebrewType; entry: HomebrewEntry }) {
  const navigate = useNavigate();
  const remove = useDeleteHomebrew();
  const [open, setOpen] = useState(false);
  const [blockedBy, setBlockedBy] = useState<ReferencingCharacter[] | null>(null);

  return (
    <>
      <Button
        variant="ghost"
        size="lg"
        className={cn(THUMB_ACTION, "text-destructive")}
        onClick={() => {
          setBlockedBy(null);
          setOpen(true);
        }}
      >
        Delete
      </Button>

      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="truncate">{blockedBy ? "Still in use" : `Delete ${nameOf(entry)}?`}</DrawerTitle>
            <DrawerDescription>
              {blockedBy
                ? "Change or remove it on these characters first, then delete it."
                : "This is stored only on this device, so deleting it cannot be undone."}
            </DrawerDescription>
          </DrawerHeader>

          {blockedBy ? (
            <ul className="flex flex-col gap-2 px-4 pt-2">
              {blockedBy.map((character) => (
                <li key={character.id}>
                  <Link
                    to="/dnd/$characterId"
                    params={{ characterId: character.id }}
                    className="flex h-12 items-center rounded-lg border border-border px-3 text-base active:bg-muted"
                  >
                    {character.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          <DrawerFooter className="pt-4">
            {blockedBy ? null : (
              <Button
                variant="destructive"
                size="lg"
                className={THUMB_ACTION}
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(
                    { type, index: entry.index },
                    {
                      onSuccess: (result) => {
                        if (result.ok) {
                          void navigate({ to: "/dnd/homebrew" });
                          return;
                        }
                        setBlockedBy(result.blockedBy);
                      },
                    },
                  )
                }
              >
                Delete
              </Button>
            )}
            <DrawerClose render={<Button variant="ghost" size="lg" className={THUMB_ACTION} />}>
              {blockedBy ? "Close" : "Cancel"}
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/**
 * Which characters an edit reached. Informational and non-blocking — the edit
 * has already been applied when this appears. An edit changes a referent that
 * still exists, so nothing can be stranded by it; the asymmetry with delete is
 * deliberate. See CONTEXT.md § Catalog reference.
 */
function AffectedDrawer({ affected, onClose }: { affected: ReferencingCharacter[]; onClose: () => void }) {
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
          <DrawerTitle>Saved</DrawerTitle>
          <DrawerDescription>
            {affected.length === 1 ? "One character uses this" : `${affected.length} characters use this`} and now shows
            the new version.
          </DrawerDescription>
        </DrawerHeader>
        <ul className="flex flex-col gap-2 px-4 pt-2">
          {affected.map((character) => (
            <li key={character.id}>
              <Link
                to="/dnd/$characterId"
                params={{ characterId: character.id }}
                className="flex h-12 items-center rounded-lg border border-border px-3 text-base active:bg-muted"
              >
                {character.name}
              </Link>
            </li>
          ))}
        </ul>
        <DrawerFooter className="pt-4">
          <Button size="lg" className={THUMB_ACTION} onClick={onClose}>
            Done
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function nameOf(entry: HomebrewEntry): string {
  return typeof entry.name === "string" && entry.name !== "" ? entry.name : entry.index;
}

function Pending() {
  return (
    <output aria-live="polite" className="flex min-h-dvh items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </output>
  );
}

/**
 * A bookmarked edit URL outlives the entry it names. Says so, and offers the
 * way back rather than a dead end.
 */
function NotFound({ type }: { type: HomebrewType }) {
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium">That {HOMEBREW_TYPES[type].label.toLowerCase()} is not here.</p>
      <p className="max-w-prose text-sm text-muted-foreground">It may have been deleted on this device.</p>
      <Button render={<Link to="/dnd/homebrew" />} nativeButton={false}>
        Back to homebrew
      </Button>
    </div>
  );
}
