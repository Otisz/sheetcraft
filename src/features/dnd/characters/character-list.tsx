import { Link } from "@tanstack/react-router";
import { ChevronRight, MoreVertical, Plus } from "lucide-react";
import { useId, useState } from "react";
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
import type { CharacterSummary } from "@/features/dnd/characters/list";
import { useCharacterList, useDeleteCharacter, useRenameCharacter } from "@/features/dnd/characters/queries";
import { normalizeCharacterName } from "@/features/dnd/characters/rename";
import { cn, THUMB_ACTION } from "@/lib/utils";

/**
 * The `/dnd` character list. Mobile-primary: rows are full-width tap targets,
 * per-row actions live in a bottom drawer within thumb reach rather than in a
 * menu at the top of the screen, and nothing is laid out wider than the
 * viewport.
 *
 * Every Dexie read and write goes through `queries.ts`, inside a query or
 * mutation callback — never at module scope. See `route.tsx`.
 */

/** Which row's action drawer is open, and what the rename field currently holds. */
type RowAction = { character: CharacterSummary; mode: "menu" | "rename" | "delete" };

export function CharacterList() {
  const characters = useCharacterList();
  const [action, setAction] = useState<RowAction | null>(null);

  if (characters.isPending) {
    return <ListPending />;
  }

  if (characters.isError) {
    return <ListFailed onRetry={() => void characters.refetch()} />;
  }

  const rows = characters.data;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold">Characters</h1>
        {rows.length > 0 ? <p className="text-sm text-muted-foreground">{rows.length}</p> : null}
      </header>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <ul className="flex flex-col gap-2 px-4 pb-28">
            {rows.map((character) => (
              <CharacterRow
                key={character.id}
                character={character}
                onOpenActions={() => setAction({ character, mode: "menu" })}
              />
            ))}
          </ul>
          {/*
            Bottom-anchored and safe-area padded: the primary action belongs
            under the thumb, not at the top of the screen.
          */}
          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
            <div className="mx-auto w-full max-w-2xl">
              <NewCharacterButton />
            </div>
          </div>
        </>
      )}

      {action ? <RowActionDrawer action={action} onChange={setAction} onClose={() => setAction(null)} /> : null}
    </div>
  );
}

/**
 * `nativeButton={false}` because this renders an anchor: Base UI expects a
 * real <button> underneath by default and warns that the native semantics it
 * relies on are gone.
 */
function NewCharacterButton({ className }: { className?: string }) {
  return (
    <Button render={<Link to="/dnd/create" />} nativeButton={false} size="lg" className={className ?? THUMB_ACTION}>
      <Plus />
      New character
    </Button>
  );
}

function CharacterRow({ character, onOpenActions }: { character: CharacterSummary; onOpenActions: () => void }) {
  return (
    <li className="flex items-stretch gap-1 overflow-hidden rounded-xl border border-border bg-card">
      <Link
        to="/dnd/$characterId"
        params={{ characterId: character.id }}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 active:bg-muted"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{character.name}</span>
          {/*
            Level, class and race on one wrapping line. `min-w-0` + `truncate`
            above and wrapping here are what keep a long homebrew name from
            widening the page.
          */}
          <span className="text-sm text-muted-foreground">
            Level {character.level} {character.className} · {character.raceName}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
      <Button
        variant="ghost"
        size="icon-lg"
        className="my-auto mr-1 shrink-0"
        onClick={onOpenActions}
        aria-label={`Actions for ${character.name}`}
      >
        <MoreVertical />
      </Button>
    </li>
  );
}

/**
 * The empty state's job is to invite the first character, not to explain the
 * app. One line of context, one obvious action.
 */
function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16 text-center">
      <p className="text-lg font-medium">No characters yet</p>
      <p className="max-w-prose text-sm text-muted-foreground">
        Roll one up and it lives on this device — no account, and it works offline.
      </p>
      <NewCharacterButton className={cn(THUMB_ACTION, "mt-2 max-w-xs")} />
    </div>
  );
}

function ListPending() {
  return (
    <output aria-live="polite" className="flex min-h-dvh items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">Loading your characters…</p>
    </output>
  );
}

function ListFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium">Your characters could not be read.</p>
      <p className="max-w-prose text-sm text-muted-foreground">
        The storage on this device did not answer. Nothing has been lost.
      </p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}

/**
 * One drawer for all three row states, so the sheet slides between them rather
 * than closing and reopening. A bottom drawer rather than a dropdown: it is
 * reachable one-handed and its targets are full-width.
 */
function RowActionDrawer({
  action,
  onChange,
  onClose,
}: {
  action: RowAction;
  onChange: (action: RowAction) => void;
  onClose: () => void;
}) {
  const { character, mode } = action;

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
        {mode === "menu" ? (
          <RowMenu
            character={character}
            onRename={() => onChange({ character, mode: "rename" })}
            onDelete={() => onChange({ character, mode: "delete" })}
          />
        ) : null}
        {mode === "rename" ? <RenameForm character={character} onDone={onClose} /> : null}
        {mode === "delete" ? <DeleteConfirm character={character} onDone={onClose} /> : null}
      </DrawerContent>
    </Drawer>
  );
}

/** The one dismissal every drawer state offers. */
function CancelAction() {
  return (
    <DrawerClose render={<Button type="button" variant="ghost" size="lg" className={THUMB_ACTION} />}>
      Cancel
    </DrawerClose>
  );
}

function RowMenu({
  character,
  onRename,
  onDelete,
}: {
  character: CharacterSummary;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="truncate">{character.name}</DrawerTitle>
        <DrawerDescription>
          Level {character.level} {character.className} · {character.raceName}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerFooter className="pt-4">
        <Button variant="outline" size="lg" className={THUMB_ACTION} onClick={onRename}>
          Rename
        </Button>
        <Button variant="destructive" size="lg" className={THUMB_ACTION} onClick={onDelete}>
          Delete
        </Button>
        <DrawerClose render={<Button variant="ghost" size="lg" className={THUMB_ACTION} />}>Cancel</DrawerClose>
      </DrawerFooter>
    </>
  );
}

function RenameForm({ character, onDone }: { character: CharacterSummary; onDone: () => void }) {
  const rename = useRenameCharacter();
  const [name, setName] = useState(character.name);
  const fieldId = useId();
  const normalized = normalizeCharacterName(name);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!normalized) {
          return;
        }
        rename.mutate({ id: character.id, name: normalized }, { onSuccess: onDone });
      }}
    >
      <DrawerHeader>
        <DrawerTitle>Rename character</DrawerTitle>
        <DrawerDescription>This changes the name only. Nothing else on the sheet moves.</DrawerDescription>
      </DrawerHeader>
      <div className="px-4 pt-4">
        <label htmlFor={fieldId} className="sr-only">
          Character name
        </label>
        <input
          id={fieldId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-12 w-full rounded-lg border border-border bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <DrawerFooter className="pt-4">
        <Button type="submit" size="lg" className={THUMB_ACTION} disabled={!normalized || rename.isPending}>
          Save
        </Button>
        <CancelAction />
      </DrawerFooter>
    </form>
  );
}

/**
 * Delete is confirmed, and the confirmation names the character — a mis-tap on
 * a list row is the failure mode, and "Delete Bruenor?" is what catches it.
 */
function DeleteConfirm({ character, onDone }: { character: CharacterSummary; onDone: () => void }) {
  const remove = useDeleteCharacter();

  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="truncate">Delete {character.name}?</DrawerTitle>
        <DrawerDescription>
          This character is stored only on this device, so deleting it cannot be undone.
        </DrawerDescription>
      </DrawerHeader>
      <DrawerFooter className="pt-4">
        <Button
          variant="destructive"
          size="lg"
          className={THUMB_ACTION}
          disabled={remove.isPending}
          onClick={() => remove.mutate(character.id, { onSuccess: onDone })}
        >
          Delete
        </Button>
        <DrawerClose render={<Button variant="ghost" size="lg" className={THUMB_ACTION} />}>Cancel</DrawerClose>
      </DrawerFooter>
    </>
  );
}
