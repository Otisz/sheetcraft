import { Delete } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { applyHpCommit, type HpCommit, type HpPool, isNoOpCommit } from "@/features/dnd/play/hp";
import { cn } from "@/lib/utils";

/**
 * The HP numpad drawer. Tapping the HP value opens it; **Damage / Heal / Temp**
 * are the commit — there is no Apply button, so the common case is
 * `tap value → type amount → tap Damage` and the sheet is closed again.
 *
 * That is a deliberate reversal of ADR-0001, which specified steppers plus a
 * mode selector and no numpad. Driving the prototype on a phone showed a numpad
 * is wanted for arbitrary amounts; the steppers stayed for ±1. See the ADR's
 * 2026-08-21 amendment.
 *
 * A custom pad rather than `inputMode="numeric"`: the commit buttons have to be
 * on screen at the same time as the digits, and an OS keypad covers them.
 */

/** The 3×4 grid, reading order. `C` clears, `⌫` deletes one digit. */
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "backspace"] as const;

type Key = (typeof KEYS)[number];

/** Four digits is more hit points than any 2014 character has. */
const MAX_DIGITS = 4;

function pressKey(entry: string, key: Key): string {
  if (key === "clear") {
    return "";
  }
  if (key === "backspace") {
    return entry.slice(0, -1);
  }
  // Leading zeros are dropped rather than accumulated: "007" is not an amount
  // anybody typed on purpose.
  const next = `${entry}${key}`.replace(/^0+(?=\d)/, "");
  return next.length > MAX_DIGITS ? entry : next;
}

/** The three commits, in the order the bottom row shows them. */
const COMMITS: { commit: HpCommit; label: string; className: string }[] = [
  {
    commit: "damage",
    label: "Damage",
    className: "bg-rose-600 text-white hover:bg-rose-600/90",
  },
  {
    commit: "heal",
    label: "Heal",
    className: "bg-emerald-600 text-white hover:bg-emerald-600/90",
  },
  {
    commit: "temp",
    label: "Temp",
    className: "bg-sky-600 text-white hover:bg-sky-600/90",
  },
];

export function HpNumpad({
  open,
  onOpenChange,
  pool,
  maxHp,
  onCommit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pool: HpPool;
  maxHp: number;
  onCommit: (pool: HpPool) => void;
}) {
  const [entry, setEntry] = useState("");
  const amount = entry === "" ? 0 : Number(entry);

  function commit(commit: HpCommit) {
    onCommit(applyHpCommit(commit, pool, amount, maxHp));
    setEntry("");
    onOpenChange(false);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          // A drawer dismissed without committing keeps nothing: a half-typed
          // amount left behind would be applied by the next tap on a commit.
          setEntry("");
        }
        onOpenChange(next);
      }}
      showSwipeHandle
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{entry === "" ? "Enter an amount" : entry}</DrawerTitle>
          <DrawerDescription>
            <Preview pool={pool} amount={amount} maxHp={maxHp} />
          </DrawerDescription>
        </DrawerHeader>

        <div className="grid grid-cols-3 gap-2 px-4 pt-4">
          {KEYS.map((key) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="lg"
              // Tall keys: this is driven with a thumb, mid-combat.
              className="h-14 text-xl font-medium"
              onClick={() => setEntry((current) => pressKey(current, key))}
              aria-label={ariaLabel(key)}
            >
              {keyLabel(key)}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {COMMITS.map(({ commit: which, label, className }) => (
            <Button
              key={which}
              type="button"
              size="lg"
              className={cn("h-14 text-base font-semibold", className)}
              // Committing nothing closes the drawer having done nothing,
              // which reads as a bug. The rule lives in `hp.ts` beside the
              // commit it guards.
              disabled={isNoOpCommit(which, entry)}
              onClick={() => commit(which)}
            >
              {label}
            </Button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * The live `damage → 18 · heal → 28` line. Showing the result before the tap is
 * what makes three unlabelled-by-outcome buttons safe to press quickly.
 */
function Preview({ pool, amount, maxHp }: { pool: HpPool; amount: number; maxHp: number }) {
  if (amount <= 0) {
    return <span>Damage, heal or grant temporary hit points.</span>;
  }

  const damaged = applyHpCommit("damage", pool, amount, maxHp);
  const healed = applyHpCommit("heal", pool, amount, maxHp);
  const temped = applyHpCommit("temp", pool, amount, maxHp);

  return (
    <span className="tabular-nums">
      damage → {damaged.currentHp}
      {damaged.tempHp > 0 ? ` +${damaged.tempHp}` : ""} · heal → {healed.currentHp} · temp → {pool.currentHp} +
      {temped.tempHp}
    </span>
  );
}

function keyLabel(key: Key) {
  if (key === "clear") {
    return "C";
  }
  if (key === "backspace") {
    return <Delete aria-hidden className="size-5" />;
  }
  return key;
}

function ariaLabel(key: Key): string {
  if (key === "clear") {
    return "Clear";
  }
  if (key === "backspace") {
    return "Delete last digit";
  }
  return key;
}
