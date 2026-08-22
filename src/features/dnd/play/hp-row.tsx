import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DeathSaveCount } from "@/features/dnd/db/schema";
import {
  DEATH_SAVE_INDEXES,
  type DeathSaveRow,
  type DeathSaves,
  deathSaveOutcome,
  NO_DEATH_SAVES,
  toggleDeathSave,
} from "@/features/dnd/play/death-saves";
import { applyDamage, applyHeal, type HpPool, hpStatus } from "@/features/dnd/play/hp";
import { HpNumpad } from "@/features/dnd/play/hp-numpad";
import { cn, THUMB_ACTION } from "@/lib/utils";

/**
 * The HP row, and the death-save panel that **replaces** it at 0.
 *
 * A replacement rather than an addition: at 0 hit points the only number that
 * matters is the pip count, and a row still offering `[−] 0 / 82 [+]` invites a
 * tap that does nothing. Healing returns the HP view and resets the pips.
 */

export function HpSection({
  pool,
  maxHp,
  deathSaves,
  onPoolChange,
  onDeathSavesChange,
}: {
  pool: HpPool;
  maxHp: number;
  deathSaves: DeathSaves;
  /** A heal from 0 must also reset the pips, which is why both arrive together. */
  onPoolChange: (pool: HpPool, deathSaves?: DeathSaves) => void;
  onDeathSavesChange: (saves: DeathSaves) => void;
}) {
  if (pool.currentHp <= 0) {
    return (
      <DeathSavePanel
        saves={deathSaves}
        onToggle={(row, index) => onDeathSavesChange(toggleDeathSave(deathSaves, row, index))}
        onHeal={() =>
          // Healing off the floor is what returns the HP view, so the pips are
          // cleared in the same write — a character back on their feet with two
          // failures showing is a sheet lying about a resolved situation.
          onPoolChange(applyHeal(pool, 1, maxHp), NO_DEATH_SAVES)
        }
      />
    );
  }

  return <HpRow pool={pool} maxHp={maxHp} onPoolChange={onPoolChange} />;
}

const BAR_COLOR: Record<ReturnType<typeof hpStatus>, string> = {
  healthy: "bg-emerald-500",
  bloodied: "bg-amber-500",
  down: "bg-rose-600",
};

function HpRow({ pool, maxHp, onPoolChange }: { pool: HpPool; maxHp: number; onPoolChange: (pool: HpPool) => void }) {
  const [numpadOpen, setNumpadOpen] = useState(false);
  const status = hpStatus(pool, maxHp);
  const filled = maxHp > 0 ? Math.min(100, (pool.currentHp / maxHp) * 100) : 0;

  return (
    <section aria-label="Hit points" className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-12 shrink-0"
          aria-label="Take 1 damage"
          onClick={() => onPoolChange(applyDamage(pool, 1, maxHp))}
        >
          <Minus className="size-5" />
        </Button>

        {/*
          The value is a button because tapping it opens the numpad — the one
          piece of play state on this screen with a second gesture.
        */}
        <Button
          type="button"
          variant="ghost"
          className="h-14 min-w-0 flex-1 flex-col gap-0.5 px-2"
          onClick={() => setNumpadOpen(true)}
          aria-label={`Hit points: ${pool.currentHp} of ${maxHp}${pool.tempHp > 0 ? `, ${pool.tempHp} temporary` : ""}. Open the numpad.`}
        >
          <span className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-3xl font-bold">{pool.currentHp}</span>
            <span className="text-base text-muted-foreground">/ {maxHp}</span>
            {pool.tempHp > 0 ? <span className="text-base font-medium text-sky-500">+{pool.tempHp}</span> : null}
          </span>
          <span className="text-[0.7rem] tracking-wide text-muted-foreground uppercase">Hit points</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-12 shrink-0"
          aria-label="Heal 1 hit point"
          onClick={() => onPoolChange(applyHeal(pool, 1, maxHp))}
        >
          <Plus className="size-5" />
        </Button>
      </div>

      {/*
        Presentational: the same numbers are already on the button above, and
        announcing a bar twice is noise for a screen reader.
      */}
      <div aria-hidden className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", BAR_COLOR[status])}
          style={{ width: `${filled}%` }}
        />
      </div>

      <HpNumpad open={numpadOpen} onOpenChange={setNumpadOpen} pool={pool} maxHp={maxHp} onCommit={onPoolChange} />
    </section>
  );
}

/**
 * The death-save panel. Three success pips, three failure pips, and the one
 * way back: heal a single hit point.
 */
function DeathSavePanel({
  saves,
  onToggle,
  onHeal,
}: {
  saves: DeathSaves;
  onToggle: (row: DeathSaveRow, index: number) => void;
  onHeal: () => void;
}) {
  const outcome = deathSaveOutcome(saves);

  return (
    <section aria-label="Death saves" className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Death saves</h2>
        {outcome ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase",
              outcome === "stable" ? "bg-emerald-600 text-white" : "bg-rose-700 text-white",
            )}
          >
            {outcome === "stable" ? "Stable" : "Dead"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">0 hit points</span>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <PipRow row="successes" label="Successes" filled={saves.successes} onToggle={onToggle} />
        <PipRow row="failures" label="Failures" filled={saves.failures} onToggle={onToggle} />
      </div>

      <Button type="button" size="lg" className={cn("mt-4", THUMB_ACTION)} onClick={onHeal}>
        Heal 1 HP
      </Button>
    </section>
  );
}

const PIP_COLOR: Record<DeathSaveRow, string> = {
  successes: "border-emerald-500 bg-emerald-500",
  failures: "border-rose-500 bg-rose-500",
};

function PipRow({
  row,
  label,
  filled,
  onToggle,
}: {
  row: DeathSaveRow;
  label: string;
  filled: DeathSaveCount;
  onToggle: (row: DeathSaveRow, index: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        {DEATH_SAVE_INDEXES.map((index) => {
          const isFilled = index <= filled;
          return (
            <button
              key={index}
              type="button"
              // Bigger than the pip it draws: the visible circle is 2rem, the
              // target around it is thumb-sized.
              className="flex size-11 items-center justify-center"
              aria-pressed={isFilled}
              aria-label={`${label} ${index}`}
              onClick={() => onToggle(row, index)}
            >
              <span
                className={cn(
                  "size-8 rounded-full border-2 transition-colors",
                  isFilled ? PIP_COLOR[row] : "border-border bg-transparent",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
