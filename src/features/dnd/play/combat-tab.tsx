import { Minus, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { CharacterRecord } from "@/features/dnd/db/schema";
import type { Attack, Derived, HitDice } from "@/features/dnd/derive";
import { signed } from "@/features/dnd/play/format";

/**
 * The Combat tab: hit dice, inspiration and attacks.
 *
 * All three are things a player reaches for *during* a turn, which is why they
 * share a tab. Hit dice and inspiration are play state and directly mutable
 * here; attacks are derived and read-only, like every other number in play mode.
 */
export function CombatTab({
  character,
  derived,
  onPlayChange,
}: {
  character: CharacterRecord;
  derived: Derived;
  onPlayChange: (play: Partial<CharacterRecord["play"]>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <HitDiceSection hitDice={derived.hitDice} onSpentChange={(hitDiceSpent) => onPlayChange({ hitDiceSpent })} />
      <InspirationSection
        inspiration={character.play.inspiration}
        onChange={(inspiration) => onPlayChange({ inspiration })}
      />
      <AttacksSection attacks={derived.attacks} />
      <HitPointRolls rolls={character.hpRolls} maxHp={derived.maxHp} />
    </div>
  );
}

/**
 * Hit dice, with steppers.
 *
 * The steppers move `spent` rather than `remaining`, because `spent` is what
 * the record stores — a stepper writing the derived half would have to invert
 * on every tap, and the inversion is where an off-by-one lives. Both ends are
 * clamped so the pool can neither owe dice nor exceed the character's level.
 */
function HitDiceSection({ hitDice, onSpentChange }: { hitDice: HitDice; onSpentChange: (spent: number) => void }) {
  return (
    <section aria-label="Hit dice" className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Hit dice</h2>
        <span className="text-xs text-muted-foreground">d{hitDice.die}</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Spend a hit die"
          disabled={hitDice.remaining === 0}
          onClick={() => onSpentChange(Math.min(hitDice.total, hitDice.spent + 1))}
        >
          <Minus />
        </Button>

        <p className="flex-1 text-center">
          <span className="text-2xl font-bold tabular-nums">{hitDice.remaining}</span>
          <span className="text-muted-foreground tabular-nums"> / {hitDice.total}</span>
          <span className="sr-only"> hit dice remaining</span>
        </p>

        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Regain a hit die"
          disabled={hitDice.spent === 0}
          onClick={() => onSpentChange(Math.max(0, hitDice.spent - 1))}
        >
          <Plus />
        </Button>
      </div>
    </section>
  );
}

/** Inspiration — a boolean the DM grants, so a switch and nothing more. */
function InspirationSection({
  inspiration,
  onChange,
}: {
  inspiration: boolean;
  onChange: (inspiration: boolean) => void;
}) {
  return (
    <section className="flex items-center justify-between rounded-xl border bg-card p-3">
      <label htmlFor="inspiration" className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className={inspiration ? "size-4 text-amber-500" : "size-4 text-muted-foreground"} />
        Inspiration
      </label>
      <Switch id="inspiration" checked={inspiration} onCheckedChange={onChange} />
    </section>
  );
}

/**
 * The attacks, each with its derived to-hit and damage.
 *
 * Damage renders as `1d8 +3` rather than a rolled number: Sheetcraft does not
 * roll, and a sheet that showed a total would be claiming an outcome it never
 * computed. See CONTEXT.md — the player is the rules engine at the table.
 */
function AttacksSection({ attacks }: { attacks: Attack[] }) {
  return (
    <section aria-label="Attacks" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Attacks</h2>

      {attacks.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          No weapons carried. Adding one is an edit, which lives behind the ⋯ menu.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {attacks.map((attack) => (
            <li key={attack.index} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{attack.name}</span>
                <span className="text-[0.7rem] text-muted-foreground uppercase">{attack.ability}</span>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-base font-semibold tabular-nums">{signed(attack.toHit)}</div>
                <div className="text-xs text-muted-foreground tabular-nums">{damageLine(attack)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The per-level hit die rolls behind max HP.
 *
 * Shown rather than folded away because the record stores the *rolls*, not a
 * total — `maxHp = sum(rolls) + conMod × level` — and a player who cannot see
 * them has no way to check the one number that decides whether they are
 * unconscious. See CONTEXT.md § Hit point rolls.
 */
function HitPointRolls({ rolls, maxHp }: { rolls: number[]; maxHp: number }) {
  return (
    <section aria-label="Hit point rolls" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Hit point rolls</h2>

      {rolls.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
          No rolls recorded.
        </p>
      ) : (
        <div className="rounded-lg border bg-card px-3 py-2">
          <ul className="flex flex-wrap gap-1">
            {rolls.map((roll, level) => (
              // The level is the identity here — two levels can roll the same
              // number, and they are still different levels.
              // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the level
              <li key={level} className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
                <span className="text-muted-foreground">L{level + 1}</span> {roll}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Plus your CON modifier per level — {maxHp} max HP in total.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * `1d8 +3 slashing`. The bonus is omitted when it is zero rather than shown as
 * `+0`: a `+0` reads as a modifier the player should remember, and it is not.
 */
function damageLine(attack: Attack): string {
  const parts = [attack.damageDice];
  if (attack.damageBonus !== 0) {
    parts.push(signed(attack.damageBonus));
  }
  if (attack.damageType) {
    parts.push(attack.damageType.toLowerCase());
  }
  return parts.filter(Boolean).join(" ");
}
