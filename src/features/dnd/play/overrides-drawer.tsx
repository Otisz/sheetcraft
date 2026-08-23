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
import type { Modifier } from "@/features/dnd/db/schema";
import type { Derived } from "@/features/dnd/derive";
import { targetLabel } from "@/features/dnd/play/effects";
import { signed } from "@/features/dnd/play/format";
import { OverrideCaption, overriddenBorder, useOverrideEditor } from "@/features/dnd/play/override-editor";
import { derivedValueFor, overrideFor, targetsForSurface } from "@/features/dnd/play/overrides";
import { cn, THUMB_ACTION } from "@/lib/utils";

/**
 * `⋯` → Overrides: the ten values that render only on the play header.
 *
 * AC, initiative, speed, proficiency bonus and the six ability scores are read
 * constantly, which is why #164 put them above the tabs — and the play surface
 * is deliberately untappable, which is why they cannot be overridden where they
 * are shown. This drawer is the answer, and it lives behind the `⋯` menu
 * because that is the door edit-by-separation designates for character data.
 *
 * The cost is real and was accepted rather than solved: a mid-session
 * correction to one of these ten is three taps deep. See ADR-0005.
 */
export function OverridesDrawer({
  derived,
  modifiers,
  open,
  onOpenChange,
  onModifiersChange,
}: {
  derived: Derived;
  modifiers: Modifier[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModifiersChange: (modifiers: Modifier[]) => void;
}) {
  const { editor, openEditor } = useOverrideEditor({ modifiers, onModifiersChange });

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Overrides</DrawerTitle>
            <DrawerDescription>
              Replace a value the sheet works out with one you supply. Everything else is overridden where it is shown,
              on its own tab.
            </DrawerDescription>
          </DrawerHeader>

          <ul className="flex max-h-[50dvh] flex-col gap-1.5 overflow-y-auto px-4">
            {targetsForSurface("menu").map((target) => (
              <li key={target}>
                <OverrideRow
                  target={target}
                  derivedValue={derivedValueFor(derived, target)}
                  override={overrideFor(modifiers, target)}
                  onOpen={() => openEditor({ target, derivedValue: derivedValueFor(derived, target) })}
                />
              </li>
            ))}
          </ul>

          <DrawerFooter className="pt-4">
            <DrawerClose render={<Button variant="ghost" size="lg" className={THUMB_ACTION} />}>Done</DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/*
        Outside the drawer rather than inside it: two stacked drawers on a phone
        leaves the editor fighting the list for the same bottom sheet, and the
        one underneath keeps its own swipe-to-dismiss.
      */}
      {editor}
    </>
  );
}

/**
 * One overridable value. Shows what the sheet currently works out, and — when
 * an override is in force — that number as well, because "17, overridden" is
 * the honest reading and "17" alone is not.
 */
function OverrideRow({
  target,
  derivedValue,
  override,
  onOpen,
}: {
  target: string;
  derivedValue: number;
  override: Modifier | undefined;
  onOpen: () => void;
}) {
  // Ability scores read as plain numbers; everything else in this drawer is a
  // modifier or a rating, and `+2` is how a player reads a proficiency bonus.
  const format = target.startsWith("ability.") || target === "ac" || target === "speed" ? String : signed;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${targetLabel(target)} ${format(derivedValue)}${override ? ", overridden" : ""}. Override it.`}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left",
        overriddenBorder(override),
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm">{targetLabel(target)}</span>
      {override ? <OverrideCaption /> : null}
      <span className="shrink-0 text-base font-semibold tabular-nums">{format(derivedValue)}</span>
    </button>
  );
}

/** The `⋯` menu's Overrides button, and the drawer behind it. */
export function OverridesMenuItem({
  derived,
  modifiers,
  onModifiersChange,
}: {
  derived: Derived;
  modifiers: Modifier[];
  onModifiersChange: (modifiers: Modifier[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = targetsForSurface("menu").filter((target) => overrideFor(modifiers, target)).length;

  return (
    <>
      <Button variant="outline" size="lg" className={THUMB_ACTION} onClick={() => setOpen(true)}>
        Overrides{count > 0 ? ` (${count})` : ""}
      </Button>
      <OverridesDrawer
        derived={derived}
        modifiers={modifiers}
        open={open}
        onOpenChange={setOpen}
        onModifiersChange={onModifiersChange}
      />
    </>
  );
}
