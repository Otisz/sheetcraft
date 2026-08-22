import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SpellSlotLevel } from "@/features/dnd/db/schema";
import type { Derived, SpellSlotPool } from "@/features/dnd/derive";
import { nameFor, signed } from "@/features/dnd/play/format";
import type { SpellSection } from "@/features/dnd/play/sections";
import type { TabData } from "@/features/dnd/play/tab-data";

/** Reports one slot level's new expended count. The parent owns the merge. */
export type SlotChangeHandler = (level: SpellSlotLevel, expended: number) => void;

/**
 * The Spells tab.
 *
 * **Always present, including for a non-caster** — a barbarian sees "No spells
 * or cantrips — Barbarian grants none." Some classes gain cantrips from a
 * subclass, so a tab that disappeared would be undiscoverable; and a player
 * whose spells genuinely vanished could not tell that from a UI that merely hid
 * the tab. See #164.
 */
export function SpellsTab({
  section,
  derived,
  names,
  onSlotsChange,
}: {
  section: SpellSection;
  derived: Derived;
  names: TabData["names"];
  onSlotsChange: SlotChangeHandler;
}) {
  if (section.empty) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        {section.emptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CastingStats derived={derived} cantripsKnown={section.cantripsKnown} />
      <Slots slots={section.slots} onSlotsChange={onSlotsChange} />
      <SpellList section={section} names={names} />
    </div>
  );
}

/**
 * Save DC and attack bonus. Rendered only when the character has them — they
 * are `null` for a non-caster, and a `0` there is a number the sheet could not
 * tell from a real one. See CONTEXT.md § Base formula.
 */
function CastingStats({ derived, cantripsKnown }: { derived: Derived; cantripsKnown: number }) {
  return (
    <section aria-label="Spellcasting" className="grid grid-cols-3 gap-2">
      <Tile label="Save DC" value={derived.spellSaveDc === null ? "—" : String(derived.spellSaveDc)} />
      <Tile label="Attack" value={derived.spellAttackBonus === null ? "—" : signed(derived.spellAttackBonus)} />
      <Tile label="Cantrips" value={String(cantripsKnown)} />
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border bg-card px-1 py-3">
      <span className="text-[0.7rem] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-xl font-bold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * The slot rows, with steppers.
 *
 * Like hit dice, the steppers move the *expended* count because that is what
 * the record stores. Only the levels the character actually has slots in appear
 * — the SRD stores explicit zeroes for the rest, and a row reading "0 / 0" is
 * noise on a phone.
 */
function Slots({ slots, onSlotsChange }: { slots: SpellSlotPool[]; onSlotsChange: SlotChangeHandler }) {
  if (slots.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
        No spell slots at this level — cantrips are cast at will.
      </p>
    );
  }

  return (
    <section aria-label="Spell slots" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Slots</h2>
      <ul className="flex flex-col gap-1.5">
        {slots.map((slot) => (
          <li key={slot.level}>
            <SlotRow slot={slot} onSlotsChange={onSlotsChange} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SlotRow({ slot, onSlotsChange }: { slot: SpellSlotPool; onSlotsChange: SlotChangeHandler }) {
  // Reports the one level it changed rather than rebuilding the map: the row
  // knows nothing about the other eight, and a row that rewrote them all would
  // silently reset any slot the parent had that this list does not render.
  const write = (expended: number) => onSlotsChange(slot.level, expended);

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
      <span className="w-16 shrink-0 text-sm font-medium">{ordinal(slot.level)}</span>

      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Expend a ${ordinal(slot.level)} slot`}
        disabled={slot.remaining === 0}
        onClick={() => write(Math.min(slot.total, slot.expended + 1))}
      >
        <Minus />
      </Button>

      <span className="flex-1 text-center tabular-nums">
        <span className="text-lg font-bold">{slot.remaining}</span>
        <span className="text-muted-foreground"> / {slot.total}</span>
      </span>

      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Regain a ${ordinal(slot.level)} slot`}
        disabled={slot.expended === 0}
        onClick={() => write(Math.max(0, slot.expended - 1))}
      >
        <Plus />
      </Button>
    </div>
  );
}

function SpellList({ section, names }: { section: SpellSection; names: TabData["names"] }) {
  return (
    <section aria-label="Spells" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Spells</h2>

      {section.spells.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
          No spells chosen yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {section.spells.map((spell) => (
            <li key={spell.ref} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{nameFor(names, spell.ref)}</span>
              {spell.prepared ? (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] font-medium text-primary">
                  Prepared
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** `1st`, `2nd`, `3rd`, then `4th`–`9th`. Nine values, so a lookup beats a rule. */
const ORDINALS: Record<SpellSlotLevel, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "5th",
  6: "6th",
  7: "7th",
  8: "8th",
  9: "9th",
};

function ordinal(level: SpellSlotLevel): string {
  return ORDINALS[level];
}
