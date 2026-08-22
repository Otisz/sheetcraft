import { Minus, Plus } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/features/dnd/content";
import {
  type AbilityDraft,
  type AbilityMethod,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  pointBuyRemaining,
  remainingArrayValues,
} from "@/features/dnd/creation/abilities";
import { ABILITIES, type Abil, type Modifier } from "@/features/dnd/db/schema";
import { cn } from "@/lib/utils";

/**
 * Ability entry, in whichever of the three methods is selected.
 *
 * The scores shown here are BASE scores. Racial bonuses are displayed beside
 * them as a separate, explained total — never folded into the input — which is
 * why a dwarf with a point-buy 15 legitimately shows CON 17. See CONTEXT.md
 * § Input vs derived.
 */

const METHODS: { id: AbilityMethod; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "standard-array", label: "Array" },
  { id: "point-buy", label: "Point buy" },
];

/** Manual entry's bounds. Wide enough not to argue with the table's own rules. */
const MANUAL_MIN = 1;
const MANUAL_MAX = 30;

export type AbilitiesFieldProps = {
  method: AbilityMethod;
  draft: AbilityDraft;
  /** The racial records, used only to show what each score becomes. */
  modifiers: Modifier[];
  onMethodChange: (method: AbilityMethod) => void;
  onScoreChange: (abil: Abil, score: number | null) => void;
  error?: string;
};

/** The racial bonus landing on one ability, summed across race and subrace. */
function bonusFor(modifiers: Modifier[], abil: Abil): number {
  return modifiers
    .filter((one) => one.target === `ability.${abil}` && one.enabled && typeof one.value === "number")
    .reduce((sum, one) => sum + (one.value as number), 0);
}

export function AbilitiesField({
  method,
  draft,
  modifiers,
  onMethodChange,
  onScoreChange,
  error,
}: AbilitiesFieldProps) {
  const remaining = pointBuyRemaining(draft);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Ability scores</h2>
        {method === "point-buy" ? (
          <p className={cn("text-sm tabular-nums", remaining < 0 ? "text-destructive" : "text-muted-foreground")}>
            {remaining} / {POINT_BUY_BUDGET} left
          </p>
        ) : null}
      </div>

      {/*
        Switching method RESETS to that method's defaults rather than clamping
        what came before — a silent clamp is more surprising, because the user
        never sees it happen. The parent owns that reset.
      */}
      <fieldset className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        <legend className="sr-only">Entry method</legend>
        {METHODS.map((one) => (
          <Button
            key={one.id}
            type="button"
            variant={method === one.id ? "default" : "ghost"}
            size="lg"
            aria-pressed={method === one.id}
            className="h-10 text-sm"
            onClick={() => onMethodChange(one.id)}
          >
            {one.label}
          </Button>
        ))}
      </fieldset>

      <ul className="flex flex-col gap-2">
        {ABILITIES.map((abil) => (
          <AbilityRow
            key={abil}
            abil={abil}
            method={method}
            draft={draft}
            bonus={bonusFor(modifiers, abil)}
            onScoreChange={onScoreChange}
          />
        ))}
      </ul>

      <FieldError message={error} />
    </section>
  );
}

function AbilityRow({
  abil,
  method,
  draft,
  bonus,
  onScoreChange,
}: {
  abil: Abil;
  method: AbilityMethod;
  draft: AbilityDraft;
  bonus: number;
  onScoreChange: (abil: Abil, score: number | null) => void;
}) {
  const fieldId = useId();
  const score = draft[abil];

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <label htmlFor={fieldId} className="w-12 shrink-0 text-sm font-semibold uppercase">
        {abil}
      </label>

      <div className="min-w-0 flex-1">
        {method === "standard-array" ? (
          <ArrayPicker fieldId={fieldId} abil={abil} draft={draft} onScoreChange={onScoreChange} />
        ) : (
          <Stepper
            fieldId={fieldId}
            abil={abil}
            score={score}
            min={method === "point-buy" ? POINT_BUY_MIN : MANUAL_MIN}
            max={method === "point-buy" ? POINT_BUY_MAX : MANUAL_MAX}
            onScoreChange={onScoreChange}
          />
        )}
      </div>

      {/*
        The racial bonus is shown, never added into the input. "15 +2 → 17" is
        the whole point of storing the bonus as a record.
      */}
      <p className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
        {bonus !== 0 && score !== null ? (
          <span className="text-foreground">
            +{bonus} → {score + bonus}
          </span>
        ) : null}
      </p>
    </li>
  );
}

/**
 * A stepper rather than a bare number input: on a phone the buttons are the
 * fast path and the field is the escape hatch. Point buy bounds it to 8–15,
 * which is what makes an out-of-range score unreachable by tapping.
 */
function Stepper({
  fieldId,
  abil,
  score,
  min,
  max,
  onScoreChange,
}: {
  fieldId: string;
  abil: Abil;
  score: number | null;
  min: number;
  max: number;
  onScoreChange: (abil: Abil, score: number | null) => void;
}) {
  const current = score ?? min;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={`Decrease ${abil}`}
        disabled={current <= min}
        onClick={() => onScoreChange(abil, current - 1)}
      >
        <Minus />
      </Button>
      <input
        id={fieldId}
        type="number"
        inputMode="numeric"
        value={score ?? ""}
        min={min}
        max={max}
        onChange={(event) => {
          const next = event.target.value === "" ? null : Number(event.target.value);
          onScoreChange(abil, next === null || Number.isNaN(next) ? null : next);
        }}
        className="h-10 w-full min-w-0 rounded-lg border border-border bg-background text-center text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={`Increase ${abil}`}
        disabled={current >= max}
        onClick={() => onScoreChange(abil, current + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}

/**
 * The standard array as a select of what is still unassigned, plus whatever
 * this ability already holds. Each value can therefore be spent exactly once,
 * which is the rule rather than a warning about the rule.
 */
function ArrayPicker({
  fieldId,
  abil,
  draft,
  onScoreChange,
}: {
  fieldId: string;
  abil: Abil;
  draft: AbilityDraft;
  onScoreChange: (abil: Abil, score: number | null) => void;
}) {
  const score = draft[abil];
  const available = remainingArrayValues(draft);
  const choices = score === null ? available : [score, ...available].sort((a, b) => b - a);

  return (
    <select
      id={fieldId}
      value={score ?? ""}
      onChange={(event) => onScoreChange(abil, event.target.value === "" ? null : Number(event.target.value))}
      className="h-10 w-full rounded-lg border border-border bg-background px-2 text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <option value="">—</option>
      {choices.map((value) => (
        <option key={value} value={value}>
          {value} ({POINT_BUY_COST[value]} pts)
        </option>
      ))}
    </select>
  );
}
