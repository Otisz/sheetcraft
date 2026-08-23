import { Minus, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { CharacterRecord, Modifier } from "@/features/dnd/db/schema";
import type { Attack, Derived, HitDice } from "@/features/dnd/derive";
import { signed } from "@/features/dnd/play/format";
import type { OverrideHandler } from "@/features/dnd/play/override-editor";
import {
  OverrideCaption,
  OverrideMarker,
  overriddenBorder,
  useOverrideEditor,
} from "@/features/dnd/play/override-editor";
import { overrideFor } from "@/features/dnd/play/overrides";
import { cn } from "@/lib/utils";

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
  onModifiersChange,
}: {
  character: CharacterRecord;
  derived: Derived;
  onPlayChange: (play: Partial<CharacterRecord["play"]>) => void;
  onModifiersChange: (modifiers: Modifier[]) => void;
}) {
  const { editor, openEditor } = useOverrideEditor({ modifiers: character.modifiers, onModifiersChange });

  return (
    <div className="flex flex-col gap-4">
      <HitDiceSection hitDice={derived.hitDice} onSpentChange={(hitDiceSpent) => onPlayChange({ hitDiceSpent })} />
      <InspirationSection
        inspiration={character.play.inspiration}
        onChange={(inspiration) => onPlayChange({ inspiration })}
      />
      <AttacksSection attacks={derived.attacks} modifiers={character.modifiers} />
      <HitPointRolls
        rolls={character.hpRolls}
        maxHp={derived.maxHp}
        override={overrideFor(character.modifiers, "maxHp")}
        onOverride={openEditor}
      />
      {editor}
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
function AttacksSection({ attacks, modifiers }: { attacks: Attack[]; modifiers: Modifier[] }) {
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
            <li
              key={attack.index}
              className={cn(
                "flex items-center gap-3 rounded-lg border bg-card px-3 py-2",
                overriddenBorder(attackOverride(modifiers, attack.index)),
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{attack.name}</span>
                <span className="text-[0.7rem] text-muted-foreground uppercase">{attack.ability}</span>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-base font-semibold tabular-nums">{signed(attack.toHit)}</div>
                <div className="text-xs text-muted-foreground tabular-nums">{damageLine(attack)}</div>
                {attackOverride(modifiers, attack.index) ? <OverrideCaption /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Whether either of one weapon's two targets carries an override.
 *
 * **Read-only, and deliberately so.** `attack.*` is not one of the 38 creation
 * targets — its keys come from the character's own equipment, so no surface can
 * enumerate them, and `setOverride` refuses to write one. But `derive()` still
 * *accepts* such a record, and `backup/parse.ts` validates characters with
 * `z.looseObject`, so a hand-edited or third-party backup can carry one into
 * the database. Marking it is what stops that number rendering silently.
 *
 * There is no clear control here because there is no creation control either:
 * offering only half the pair on a family the app cannot enumerate is worse
 * than a marker that says "this came from somewhere else". Whether `attack.*`
 * gains a real creation surface is left to whichever ticket needs it — see
 * ADR-0005.
 */
function attackOverride(modifiers: Modifier[], index: string): boolean {
  return modifiers.some(
    (modifier) =>
      modifier.source === "override" &&
      (modifier.target === `attack.${index}.hit` || modifier.target === `attack.${index}.damage`),
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
function HitPointRolls({
  rolls,
  maxHp,
  override,
  onOverride,
}: {
  rolls: number[];
  maxHp: number;
  override: Modifier | undefined;
  onOverride: OverrideHandler;
}) {
  return (
    <section aria-label="Hit point rolls" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Hit point rolls</h2>
        {/*
          Max HP is overridden HERE rather than on the header HP row. The row is
          play state — a numpad that spends and restores hit points — and a tap
          that redefines the maximum in the middle of that is a different verb
          wearing the same clothes. Here it sits beside the rolls it is the sum
          of, which is where the question "why is my max 38?" is asked. See ADR-0005.
        */}
        {override ? <OverrideMarker onClear={() => onOverride({ target: "maxHp", derivedValue: maxHp })} /> : null}
      </div>

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

      {/*
        Outside the empty-state branch on purpose: a character with no recorded
        rolls still has a max HP, and it is exactly the character most likely to
        need it hand-set. Inside the branch this control would vanish for them.
      */}
      <button
        type="button"
        onClick={() => onOverride({ target: "maxHp", derivedValue: maxHp })}
        className="self-start text-xs text-muted-foreground underline underline-offset-2"
      >
        {override ? `Change the override — worked out as ${maxHp}` : "Override max HP"}
      </button>
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
