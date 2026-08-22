import { SlidersHorizontal } from "lucide-react";
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
import type { CharacterRecord, Modifier, Ref } from "@/features/dnd/db/schema";
import {
  activeConditions,
  activeEffects,
  type ConditionState,
  describeModifier,
  effectGroups,
  toggleCondition,
  toggleEffect,
} from "@/features/dnd/play/effects";
import { cn, THUMB_ACTION } from "@/lib/utils";

/**
 * The effects row: **active things only**, in two visual languages that must
 * never merge.
 *
 * - **Amber, filled** — effects that change your numbers. Toggling one moves AC
 *   or speed on this screen.
 * - **Rose, outlined** — SRD conditions that are reminders only. Their real
 *   effects are advantage/disadvantage and movement, which Sheetcraft does not
 *   compute.
 *
 * If Prone looked like Unarmored Defense, the row would imply arithmetic the
 * app never did, and a player might trust a number that was never adjusted.
 * See CONTEXT.md § Condition.
 *
 * The pill's label is fixed — "Effects & conditions", never a count. A
 * `+18 more` reads as a tally of something missing rather than as a door.
 */

const EFFECT_PILL = "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300";
const CONDITION_PILL = "border-rose-500 bg-transparent text-rose-700 dark:text-rose-300";

export function EffectsRow({
  character,
  onModifiersChange,
  onConditionsChange,
}: {
  character: CharacterRecord;
  onModifiersChange: (modifiers: Modifier[]) => void;
  onConditionsChange: (conditions: Ref[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const effects = activeEffects(character);
  const conditions = activeConditions(character);

  return (
    <section aria-label="Effects and conditions" className="flex flex-wrap items-center gap-2">
      {effects.map((effect) => (
        <Pill key={effect.id} className={EFFECT_PILL}>
          {effect.label}
        </Pill>
      ))}
      {conditions.map((condition) => (
        <Pill key={condition.index} className={CONDITION_PILL}>
          {condition.name}
        </Pill>
      ))}

      <Button type="button" variant="outline" size="sm" className="h-9 rounded-full px-3" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="size-3.5" />
        Effects &amp; conditions
      </Button>

      <EffectsDrawer
        open={open}
        onOpenChange={setOpen}
        character={character}
        onModifiersChange={onModifiersChange}
        onConditionsChange={onConditionsChange}
      />
    </section>
  );
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", className)}>{children}</span>;
}

/**
 * The full list, in two explicitly labelled groups. The labels do the work the
 * colours alone cannot: colour is not available to every reader, and the
 * distinction is the one thing this drawer must not leave implicit.
 */
function EffectsDrawer({
  open,
  onOpenChange,
  character,
  onModifiersChange,
  onConditionsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character: CharacterRecord;
  onModifiersChange: (modifiers: Modifier[]) => void;
  onConditionsChange: (conditions: Ref[]) => void;
}) {
  const groups = effectGroups(character);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Effects &amp; conditions</DrawerTitle>
          <DrawerDescription>Only the ones you switch on appear on the sheet.</DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
          <GroupHeading title="Effects" note="change your numbers" />
          {groups.effects.length === 0 ? (
            <EmptyGroup>Nothing yet — features and magic items land here.</EmptyGroup>
          ) : (
            <ul className="flex flex-col gap-2">
              {groups.effects.map((effect) => (
                <li key={effect.id}>
                  <ToggleRow
                    label={effect.label}
                    detail={describeModifier(effect)}
                    active={effect.enabled}
                    activeClassName={EFFECT_PILL}
                    onToggle={() => onModifiersChange(toggleEffect(character.modifiers, effect.id))}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="pt-6">
            <GroupHeading
              title="Conditions"
              note="reminders only — their effects are advantage/disadvantage and movement, which Sheetcraft does not compute"
            />
            <ul className="flex flex-col gap-2">
              {groups.conditions.map((condition) => (
                <li key={condition.index}>
                  <ConditionToggle
                    condition={condition}
                    onToggle={() => onConditionsChange(toggleCondition(character.play.conditions, condition.index))}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DrawerFooter>
          <DrawerClose render={<Button type="button" variant="ghost" size="lg" className={THUMB_ACTION} />}>
            Done
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function GroupHeading({ title, note }: { title: string; note: string }) {
  return (
    <div className="pb-2">
      <h3 className="text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">· {note}</span>
      </h3>
    </div>
  );
}

function EmptyGroup({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}

function ConditionToggle({ condition, onToggle }: { condition: ConditionState; onToggle: () => void }) {
  return (
    <ToggleRow
      label={condition.name}
      detail={condition.description}
      active={condition.active}
      activeClassName={CONDITION_PILL}
      onToggle={onToggle}
    />
  );
}

/**
 * One switchable row. A full-width tap target with the state on the row itself
 * rather than a switch off to one side — the whole row is reachable with a
 * thumb, and a 44px switch beside 300px of dead space is a smaller target for
 * no reason.
 */
function ToggleRow({
  label,
  detail,
  active,
  activeClassName,
  onToggle,
}: {
  label: string;
  detail: string;
  active: boolean;
  activeClassName: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors active:bg-muted",
        active ? activeClassName : "border-border bg-background",
      )}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className={cn("text-xs", active ? "opacity-90" : "text-muted-foreground")}>{detail}</span>
    </button>
  );
}
