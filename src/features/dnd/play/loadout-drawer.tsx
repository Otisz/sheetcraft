import { Check, Plus, Search, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
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
import type { PickerOption } from "@/features/dnd/content/options";
import type { Ref } from "@/features/dnd/db/schema";
import { cn, THUMB_ACTION, THUMB_CONTROL } from "@/lib/utils";

/**
 * The scaffolding both loadout drawers share: the list of what the character
 * holds, and the "Add" picker behind it.
 *
 * Written once for the reason `override-editor.tsx` centralises the marker —
 * equipment and spells differ in what a row *does* (equip, prepare) but not at
 * all in how a thing is found, added and dropped, and two spellings of that
 * would drift. See ADR-0007.
 *
 * Both drawers live behind the `⋯` menu rather than on their tabs. The
 * Inventory and Spells tabs stay exactly the read-only surfaces #164 built:
 * acquiring a breastplate moves AC, and edit-by-separation is what keeps a
 * number that size off a screen used mid-combat.
 */

/** One row in the "what you hold" list, however the caller wants it labelled. */
export type HeldRow = {
  ref: Ref;
  name: string;
  /** Rendered between the name and the remove control — quantity, an equip switch. */
  controls?: ReactNode;
};

export function LoadoutDrawer({
  title,
  description,
  emptyMessage,
  addLabel,
  held,
  options,
  optionsPending,
  open,
  onOpenChange,
  onAdd,
  onRemove,
}: {
  title: string;
  description: string;
  /** Shown when nothing is held. Always a sentence, never a blank panel. */
  emptyMessage: string;
  addLabel: string;
  held: HeldRow[];
  options: PickerOption[];
  optionsPending: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (ref: Ref) => void;
  onRemove: (ref: Ref) => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>

          <div className="max-h-[50dvh] overflow-y-auto px-4">
            {held.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {held.map((row) => (
                  <li key={row.ref} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
                    {row.controls}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${row.name}`}
                      className="shrink-0 text-muted-foreground"
                      onClick={() => onRemove(row.ref)}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DrawerFooter className="pt-4">
            <Button variant="outline" size="lg" className={THUMB_ACTION} onClick={() => setPicking(true)}>
              <Plus />
              {addLabel}
            </Button>
            <DrawerClose render={<Button variant="ghost" size="lg" className={THUMB_ACTION} />}>Done</DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/*
        Outside the drawer rather than inside it, for the reason
        `OverridesDrawer` gives: two stacked drawers on a phone leave the inner
        one fighting the outer for the same bottom sheet.
      */}
      <AddPicker
        title={addLabel}
        options={options}
        pending={optionsPending}
        open={picking}
        onOpenChange={setPicking}
        onPick={(ref) => {
          onAdd(ref);
          setPicking(false);
        }}
      />
    </>
  );
}

/**
 * The picker that finds one thing to add.
 *
 * A **search box**, unlike `PickerField` — that one chooses among a race's
 * four subraces, this one among the SRD's several hundred items or spells, and
 * a list that long is unusable by scroll on a phone.
 *
 * The grouping is the same as every other picker's: SRD first, then homebrew
 * under an `HB` badge. Mixing them alphabetically would bury the SRD entries.
 */
function AddPicker({
  title,
  options,
  pending,
  open,
  onOpenChange,
  onPick,
}: {
  title: string;
  options: PickerOption[];
  pending: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (ref: Ref) => void;
}) {
  const [query, setQuery] = useState("");

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle === "" ? options : options.filter((one) => one.name.toLowerCase().includes(needle));

    return {
      catalog: matches.filter((one) => one.source === "catalog"),
      homebrew: matches.filter((one) => one.source === "homebrew"),
    };
  }, [options, query]);

  return (
    <Drawer
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) {
          // Cleared on close, so re-opening starts from the whole list rather
          // than from a filter the player has forgotten they typed.
          setQuery("");
        }
        onOpenChange(next);
      }}
      showSwipeHandle
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>SRD content first, then anything you have written yourself.</DrawerDescription>
        </DrawerHeader>

        <div className="px-4">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label={`Search ${title.toLowerCase()}`}
              className={cn(
                THUMB_CONTROL,
                "rounded-lg border bg-card pr-3 pl-9 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              )}
            />
          </div>
        </div>

        <div className="max-h-[50dvh] overflow-y-auto px-4 pt-2">
          {pending ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> : null}
          {!pending && matching.catalog.length === 0 && matching.homebrew.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches that.</p>
          ) : null}

          <OptionGroup heading="SRD" options={matching.catalog} onPick={onPick} />
          <OptionGroup heading="HOMEBREW" options={matching.homebrew} onPick={onPick} />
        </div>

        <DrawerFooter className="pt-4">
          <DrawerClose render={<Button variant="ghost" size="lg" className={THUMB_ACTION} />}>Cancel</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * One heading plus its rows, rendering nothing when the group is empty.
 *
 * Capped, and the cap is announced rather than silent. The SRD ships several
 * hundred items; a drawer that rendered every one would take a visible moment
 * to paint on a phone. A truncation the player cannot see would read as "this
 * item does not exist", which is the one thing a search must never say
 * falsely — so the count that did not fit is on screen, next to the advice
 * that narrows it.
 */
function OptionGroup({
  heading,
  options,
  onPick,
}: {
  heading: string;
  options: PickerOption[];
  onPick: (ref: Ref) => void;
}) {
  if (options.length === 0) {
    return null;
  }

  const shown = options.slice(0, MAX_ROWS);
  const hidden = options.length - shown.length;

  return (
    <div className="pb-2">
      <p className="px-1 py-2 text-xs font-semibold tracking-wide text-muted-foreground">{heading}</p>
      <ul className="flex flex-col">
        {shown.map((option) => (
          <li key={option.ref}>
            <button
              type="button"
              onClick={() => onPick(option.ref)}
              className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base active:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              {option.source === "homebrew" ? (
                <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">
                  HB
                </span>
              ) : null}
              <Check className="size-4 shrink-0 text-transparent" />
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {hidden} more — narrow the search to see {hidden === 1 ? "it" : "them"}.
        </p>
      ) : null}
    </div>
  );
}

/** How many rows one group renders before asking the player to narrow the search. */
const MAX_ROWS = 50;
