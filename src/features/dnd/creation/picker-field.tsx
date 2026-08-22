import { Check, ChevronDown, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { FieldError } from "@/features/dnd/creation/field-error";
import type { PickerOption } from "@/features/dnd/creation/options";
import type { Ref } from "@/features/dnd/db/schema";
import { cn } from "@/lib/utils";

/**
 * One catalog picker. A bottom drawer rather than a `<select>`: the list is
 * grouped (SRD, then HOMEBREW with an `HB` badge, then the create action), and
 * a native select cannot carry a badge or a footer action.
 *
 * The groups are ordered, not merged alphabetically — SRD is what most people
 * want and mixing homebrew through it would bury it.
 */

export type PickerFieldProps = {
  label: string;
  placeholder: string;
  options: PickerOption[];
  value: Ref | null;
  onChange: (ref: Ref) => void;
  /** Rendered under the trigger, in destructive colour. */
  error?: string;
  /** Shown while the catalog read is in flight. */
  pending?: boolean;
};

/** Field controls are thumb-height throughout the page. */
const CONTROL = "h-12 w-full";

function selectedName(options: PickerOption[], value: Ref | null): string | null {
  return options.find((one) => one.ref === value)?.name ?? null;
}

export function PickerField({ label, placeholder, options, value, onChange, error, pending }: PickerFieldProps) {
  const [open, setOpen] = useState(false);
  const chosen = selectedName(options, value);

  const groups = useMemo(
    () => ({
      catalog: options.filter((one) => one.source === "catalog"),
      homebrew: options.filter((one) => one.source === "homebrew"),
    }),
    [options],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={pending}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, "justify-between px-3 text-base font-normal")}
        onClick={() => setOpen(true)}
      >
        <span className={cn("truncate", !chosen && "text-muted-foreground")}>
          {pending ? "Loading…" : (chosen ?? placeholder)}
        </span>
        <ChevronDown className="shrink-0 text-muted-foreground" />
      </Button>
      <FieldError message={error} />

      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{label}</DrawerTitle>
            <DrawerDescription>SRD content first, then anything you have written yourself.</DrawerDescription>
          </DrawerHeader>

          <div className="max-h-[60dvh] overflow-y-auto px-4 pt-2">
            {options.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing to choose from yet.</p>
            ) : null}

            <OptionGroup
              heading="SRD"
              options={groups.catalog}
              value={value}
              onPick={(ref) => {
                onChange(ref);
                setOpen(false);
              }}
            />
            <OptionGroup
              heading="HOMEBREW"
              options={groups.homebrew}
              value={value}
              onPick={(ref) => {
                onChange(ref);
                setOpen(false);
              }}
            />
          </div>

          <DrawerFooter className="pt-4">
            {/*
              Homebrew authoring is its own ticket
              ([#165](https://github.com/Otisz/sheetcraft/issues/165)). The
              action is shown, and says so, rather than being hidden — a picker
              that never mentions homebrew is a picker nobody discovers it in.
            */}
            <Button type="button" variant="ghost" size="lg" className={cn(CONTROL, "text-base")} disabled>
              <Plus />
              Create homebrew… (soon)
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/** One heading plus its rows. Renders nothing at all when the group is empty. */
function OptionGroup({
  heading,
  options,
  value,
  onPick,
}: {
  heading: string;
  options: PickerOption[];
  value: Ref | null;
  onPick: (ref: Ref) => void;
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <div className="pb-2">
      <p className="px-1 py-2 text-xs font-semibold tracking-wide text-muted-foreground">{heading}</p>
      <ul className="flex flex-col">
        {options.map((option) => (
          <li key={option.ref}>
            <button
              type="button"
              onClick={() => onPick(option.ref)}
              aria-pressed={option.ref === value}
              className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base active:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              {option.source === "homebrew" ? (
                <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">
                  HB
                </span>
              ) : null}
              {option.ref === value ? <Check className="size-4 shrink-0" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
