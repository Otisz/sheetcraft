import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSpellOptions } from "@/features/dnd/content/queries";
import type { CharacterSpells } from "@/features/dnd/db/schema";
import { nameFor } from "@/features/dnd/play/format";
import { addSpell, heldSpells, removeSpell, togglePrepared } from "@/features/dnd/play/loadout";
import { LoadoutDrawer } from "@/features/dnd/play/loadout-drawer";
import { THUMB_ACTION } from "@/lib/utils";

/**
 * `⋯` → Spells: the spells this character knows, and which of them are
 * prepared.
 *
 * Behind the `⋯` menu for the same reason the Equipment drawer is: the spell
 * list is character data, and the Spells tab is where it is consulted. The
 * *slot* steppers stay on the tab, because expending a slot is play state and
 * changes every session — that split is the one #164 drew and this does not
 * move it.
 *
 * **No class-list filter and no known/prepared limits.** The app does not
 * derive class spellcasting rules — which classes prepare rather than know,
 * how many of each a level allows — so a limit here would be the app refusing
 * a legal choice it cannot actually adjudicate. Schema-valid is valid;
 * mechanical sanity is the table's business. See ADR-0007.
 */
export function SpellsDrawer({
  spells,
  names,
  open,
  onOpenChange,
  onSpellsChange,
}: {
  spells: CharacterSpells;
  names: Partial<Record<string, string>>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reports the TRANSFORM, not the finished list — see the Equipment drawer. */
  onSpellsChange: (apply: (current: CharacterSpells) => CharacterSpells) => void;
}) {
  const options = useSpellOptions(open);

  const held = heldSpells(spells);

  return (
    <LoadoutDrawer
      title="Spells"
      description="The spells this character knows, and which are prepared. Slots are expended on the Spells tab."
      emptyMessage="No spells yet."
      addLabel="Add a spell"
      open={open}
      onOpenChange={onOpenChange}
      options={options.data ?? []}
      optionsPending={options.isPending && open}
      onAdd={(ref) => onSpellsChange((current) => addSpell(current, ref))}
      onRemove={(ref) => onSpellsChange((current) => removeSpell(current, ref))}
      held={held.map((ref) => ({
        ref,
        name: nameFor(names, ref),
        controls: (
          <PreparedSwitch
            name={nameFor(names, ref)}
            prepared={spells.prepared.includes(ref)}
            onToggle={() => onSpellsChange((current) => togglePrepared(current, ref))}
          />
        ),
      }))}
    />
  );
}

/**
 * The prepared switch.
 *
 * Unpreparing does not forget the spell — a wizard keeps it in their book
 * across a preparation change. Forgetting is the row's remove control, which
 * is why the two are separate affordances rather than one.
 */
function PreparedSwitch({ name, prepared, onToggle }: { name: string; prepared: boolean; onToggle: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="text-[0.7rem] text-muted-foreground uppercase">Prep</span>
      <Switch checked={prepared} onCheckedChange={onToggle} aria-label={`${name} prepared`} />
    </div>
  );
}

/** The `⋯` menu's Spells button, and the drawer behind it. */
export function SpellsMenuItem({
  spells,
  names,
  onSpellsChange,
}: {
  spells: CharacterSpells;
  names: Partial<Record<string, string>>;
  onSpellsChange: (apply: (current: CharacterSpells) => CharacterSpells) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = heldSpells(spells).length;

  return (
    <>
      <Button variant="outline" size="lg" className={THUMB_ACTION} onClick={() => setOpen(true)}>
        Spells{count > 0 ? ` (${count})` : ""}
      </Button>
      <SpellsDrawer spells={spells} names={names} open={open} onOpenChange={setOpen} onSpellsChange={onSpellsChange} />
    </>
  );
}
