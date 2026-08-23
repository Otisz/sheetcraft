import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useEquipmentOptions } from "@/features/dnd/content/queries";
import type { CharacterEquipmentEntry } from "@/features/dnd/db/schema";
import { nameFor } from "@/features/dnd/play/format";
import { addItem, removeItem, setQuantity, toggleEquipped } from "@/features/dnd/play/loadout";
import { LoadoutDrawer } from "@/features/dnd/play/loadout-drawer";
import { THUMB_ACTION } from "@/lib/utils";

/**
 * `⋯` → Equipment: what the character carries, and what they have equipped.
 *
 * Behind the `⋯` menu rather than on the Inventory tab, which is the door
 * edit-by-separation designates for character data. The reason is `equipped`:
 * it drives the `equip:` records `derive()` builds armor AC from, so a switch
 * on a play screen is a switch that silently moves AC mid-combat — the same
 * argument `effects.ts` already makes when it keeps `equip:` out of the
 * effects drawer's toggle list. See ADR-0007.
 *
 * The Inventory tab keeps rendering the list read-only, which is where the
 * record is *consulted*. This is where it is changed.
 */
export function EquipmentDrawer({
  equipment,
  names,
  open,
  onOpenChange,
  onEquipmentChange,
}: {
  equipment: CharacterEquipmentEntry[];
  names: Partial<Record<string, string>>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Reports the TRANSFORM, not the finished list. The drawer renders from a
   * prop that only updates once a mutation settles, so two quick taps would
   * both compute from the same stale snapshot and the first would be lost.
   * Handing the repository a function lets it apply the change to the row it
   * has just read. See `updateCharacterRefs`.
   */
  onEquipmentChange: (apply: (current: CharacterEquipmentEntry[]) => CharacterEquipmentEntry[]) => void;
}) {
  // Only while the drawer is open: the equipment table is the largest in the
  // catalog, and a sheet that never opens this pays nothing for it.
  const options = useEquipmentOptions(open);

  return (
    <LoadoutDrawer
      title="Equipment"
      description="What this character carries, and what they have equipped. Equipping armor or a shield moves AC."
      emptyMessage="Nothing carried yet."
      addLabel="Add an item"
      open={open}
      onOpenChange={onOpenChange}
      options={options.data ?? []}
      optionsPending={options.isPending && open}
      onAdd={(ref) => onEquipmentChange((current) => addItem(current, ref))}
      onRemove={(ref) => onEquipmentChange((current) => removeItem(current, ref))}
      held={equipment.map((entry) => ({
        ref: entry.itemRef,
        name: nameFor(names, entry.itemRef),
        controls: (
          <ItemControls
            entry={entry}
            name={nameFor(names, entry.itemRef)}
            onQuantityChange={(quantity) =>
              onEquipmentChange((current) => setQuantity(current, entry.itemRef, quantity))
            }
            onEquippedChange={() => onEquipmentChange((current) => toggleEquipped(current, entry.itemRef))}
          />
        ),
      }))}
    />
  );
}

/**
 * The quantity stepper and the equip switch.
 *
 * The switch is the **only** thing that moves `equipped` — CONTEXT's rule that
 * two ways to unequip a shield is one way too many. It is a switch rather than
 * a tap on the row because the row already has a remove control, and a player
 * reaching to sheathe a sword must not drop it.
 */
function ItemControls({
  entry,
  name,
  onQuantityChange,
  onEquippedChange,
}: {
  entry: CharacterEquipmentEntry;
  name: string;
  onQuantityChange: (quantity: number) => void;
  onEquippedChange: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`One fewer ${name}`}
        // Floors at one: removing the last copy is the remove control's job,
        // and stepping to zero here would take the equipped flag with it.
        disabled={entry.quantity <= 1}
        onClick={() => onQuantityChange(entry.quantity - 1)}
      >
        <Minus />
      </Button>
      <span className="w-5 text-center text-sm tabular-nums">{entry.quantity}</span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`One more ${name}`}
        onClick={() => onQuantityChange(entry.quantity + 1)}
      >
        <Plus />
      </Button>
      <Switch
        checked={entry.equipped}
        onCheckedChange={onEquippedChange}
        aria-label={`${name} equipped`}
        className="ml-1"
      />
    </div>
  );
}

/** The `⋯` menu's Equipment button, and the drawer behind it. */
export function EquipmentMenuItem({
  equipment,
  names,
  onEquipmentChange,
}: {
  equipment: CharacterEquipmentEntry[];
  names: Partial<Record<string, string>>;
  onEquipmentChange: (apply: (current: CharacterEquipmentEntry[]) => CharacterEquipmentEntry[]) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="lg" className={THUMB_ACTION} onClick={() => setOpen(true)}>
        Equipment{equipment.length > 0 ? ` (${equipment.length})` : ""}
      </Button>
      <EquipmentDrawer
        equipment={equipment}
        names={names}
        open={open}
        onOpenChange={setOpen}
        onEquipmentChange={onEquipmentChange}
      />
    </>
  );
}
