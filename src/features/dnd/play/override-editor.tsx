import { X } from "lucide-react";
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
import type { Modifier } from "@/features/dnd/db/schema";
import { clearOverride, targetLabel } from "@/features/dnd/play/effects";
import { overrideFor, setOverride } from "@/features/dnd/play/overrides";
import { cn, THUMB_ACTION, THUMB_CONTROL } from "@/lib/utils";

/**
 * The one way an override is created, and the one way it is marked.
 *
 * Both surfaces ADR-0005 settles on — a tap on the value's own tab, and the
 * `⋯` → Overrides drawer for the ten values that render only on the play
 * header — go through these two components. Written once because the amber
 * marker is a *claim about the number next to it*, and two spellings of that
 * claim would eventually disagree about when it appears.
 */

/**
 * The editor drawer. Opens on the value, pre-filled with what the sheet
 * currently shows, so the common correction is an edit of one digit rather than
 * a number typed from nothing.
 */
export function OverrideEditor({
  target,
  derivedValue,
  override,
  open,
  onOpenChange,
  onSet,
  onClear,
}: {
  target: string;
  /** What derivation produces right now — the placeholder, and what clearing returns to. */
  derivedValue: number;
  override: Modifier | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSet: (value: number) => void;
  onClear: () => void;
}) {
  const fieldId = useId();
  const label = targetLabel(target);

  // Keyed on `open` so re-opening the drawer starts from the current value
  // again rather than from whatever was last typed and abandoned.
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);
  const shown = touched ? draft : String(override ? overrideValue(override, derivedValue) : derivedValue);

  const parsed = Number(shown);
  const valid = shown.trim() !== "" && Number.isFinite(parsed);

  function close() {
    setTouched(false);
    setDraft("");
    onOpenChange(false);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next: boolean) => {
        if (next) {
          onOpenChange(true);
          return;
        }
        close();
      }}
      showSwipeHandle
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Override {label}</DrawerTitle>
          <DrawerDescription>
            A value you supply, replacing the one the sheet works out. It stays until you clear it.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-3 px-4">
          <label htmlFor={fieldId} className="text-sm font-medium">
            {label}
          </label>
          {/*
            `inputMode="numeric"` rather than `type="number"`: the spinner
            arrows are unusable at thumb size, and a number input silently
            reports an empty string for anything it cannot parse, which is how
            a typo becomes a zero.
          */}
          <input
            id={fieldId}
            inputMode="numeric"
            value={shown}
            onChange={(event) => {
              setTouched(true);
              setDraft(event.target.value);
            }}
            className={cn(
              THUMB_CONTROL,
              "rounded-lg border bg-card px-3 text-base tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            )}
          />
          <p className="text-xs text-muted-foreground">
            Worked out as <span className="tabular-nums">{derivedValue}</span>
            {override ? " before this override." : "."}
          </p>
        </div>

        <DrawerFooter className="pt-4">
          <Button
            size="lg"
            className={THUMB_ACTION}
            disabled={!valid}
            onClick={() => {
              onSet(parsed);
              close();
            }}
          >
            {override ? "Update override" : "Set override"}
          </Button>
          {/*
            Clearing is offered here as well as on the marker: a player who
            opened this drawer to fix a number may decide the honest answer is
            the derived one, and making them close the drawer to find the other
            control would be a maze.
          */}
          {override ? (
            <Button
              variant="outline"
              size="lg"
              className={THUMB_ACTION}
              onClick={() => {
                onClear();
                close();
              }}
            >
              Clear override — back to {derivedValue}
            </Button>
          ) : null}
          <DrawerClose render={<Button variant="ghost" size="lg" className={THUMB_ACTION} />}>Cancel</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** An override's own number, falling back to the derived one for a `{ref}` value. */
function overrideValue(override: Modifier, derivedValue: number): number {
  return typeof override.value === "number" ? override.value : derivedValue;
}

/** What a surface opens the editor with: the target, and what it derives to now. */
export type OverrideTarget = { target: string; derivedValue: number };

/** Opens the override editor on one value. */
export type OverrideHandler = (editing: OverrideTarget) => void;

/**
 * The editor, plus the open/close state and the two writes behind it.
 *
 * A hook rather than three copies of the same twenty lines: every creation
 * surface needs exactly this — one editor for the whole surface, opened on
 * whichever value was tapped — and three spellings of "set, then clear" is
 * three chances for one of them to forget that clearing means deleting.
 */
export function useOverrideEditor({
  modifiers,
  onModifiersChange,
}: {
  modifiers: Modifier[];
  onModifiersChange: (modifiers: Modifier[]) => void;
}) {
  const [editing, setEditing] = useState<OverrideTarget | null>(null);

  const editor = editing ? (
    <OverrideEditor
      target={editing.target}
      derivedValue={editing.derivedValue}
      override={overrideFor(modifiers, editing.target)}
      open
      onOpenChange={(open) => {
        if (!open) {
          setEditing(null);
        }
      }}
      onSet={(value) => onModifiersChange(setOverride(modifiers, editing.target, value))}
      onClear={() => onModifiersChange(clearOverride(modifiers, editing.target))}
    />
  ) : null;

  return { editor, openEditor: setEditing as OverrideHandler };
}

/**
 * The amber "overridden" caption, and the tap that clears it.
 *
 * The marker is not decoration: without it the sheet shows a hand-set number
 * with nothing saying so, which is worse than having no override at all. Every
 * surface that can *create* an override renders this, which is the coupling
 * ADR-0005 makes a test rather than a convention.
 */
export function OverrideMarker({ onClear, className }: { onClear: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClear} className={cn(MARKER_TEXT, "inline-flex items-center gap-0.5", className)}>
      overridden
      <X className="size-3" />
    </button>
  );
}

/** The amber the marker and its border share, in one place so they cannot drift apart. */
const MARKER_TEXT = "text-[0.65rem] text-amber-600 dark:text-amber-400";

/**
 * The marker as a plain caption, with no clear control.
 *
 * For the surfaces where the whole row is already a button that opens the
 * editor: nesting a clear button inside it would be a button inside a button,
 * which is invalid and which swallows the outer tap. Clearing is offered in the
 * editor the row opens instead.
 */
export function OverrideCaption({ className }: { className?: string }) {
  return <span className={cn(MARKER_TEXT, "shrink-0", className)}>overridden</span>;
}

/**
 * The amber border a value carries while overridden.
 *
 * One helper rather than the ternary spelled at each surface — it had reached
 * four spellings, three of which bypassed `cn` and so could not be overridden
 * by a caller's own border class.
 */
export function overriddenBorder(override: unknown): string {
  return override ? "border-amber-500" : "border-border";
}
