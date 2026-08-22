import { Link, useNavigate } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FieldError,
  PickerField,
  useClassOptions,
  useRaceOptions,
  useSubclassOptions,
  useSubraceOptions,
} from "@/features/dnd/content";
import { AbilitiesField } from "@/features/dnd/creation/abilities-field";
import {
  buildCreateInput,
  type CreationDraft,
  type DraftContext,
  type DraftIssue,
  draftIssues,
  emptyDraft,
  MAX_LEVEL,
  MIN_LEVEL,
  setAbilityMethod,
  setLevel,
  setRace,
  showsSubclass,
} from "@/features/dnd/creation/draft";
import { useCreateCharacter, useSubclassLevel } from "@/features/dnd/creation/queries";
import { floatingBonusChoices, racialModifiers, toRacialSource } from "@/features/dnd/creation/racial-bonuses";
import { ABILITIES, type Abil } from "@/features/dnd/db/schema";
import { cn, THUMB_CONTROL } from "@/lib/utils";

/**
 * Character creation: a SINGLE SCROLLING PAGE, not a wizard. It asks for name,
 * class, level, a conditional subclass, race, a conditional subrace, and
 * abilities — nothing else. Equipment, spells and background are the sheet's
 * business, not the door's.
 *
 * Every rule it enforces lives in `draft.ts` and is tested there; this file is
 * the surface. There are deliberately NO balance warnings — mechanical sanity
 * is the table's business, not the app's.
 */

export function CreateCharacterForm() {
  const navigate = useNavigate();
  const create = useCreateCharacter();
  const nameId = useId();

  const [draft, setDraft] = useState<CreationDraft>(emptyDraft);
  /** Issues are hidden until the first submit — a form that scolds on load is a form that scolds. */
  const [submitted, setSubmitted] = useState(false);

  const classes = useClassOptions();
  const races = useRaceOptions();
  const subclasses = useSubclassOptions(draft.classRef);
  const subraces = useSubraceOptions(draft.raceRef);
  const subclassLevel = useSubclassLevel(draft.classRef);

  const classEntry = useMemo(
    () => classes.data?.find((one) => one.ref === draft.classRef) ?? null,
    [classes.data, draft.classRef],
  );
  const raceEntry = useMemo(
    () => races.data?.find((one) => one.ref === draft.raceRef) ?? null,
    [races.data, draft.raceRef],
  );
  const subraceEntry = useMemo(
    () => subraces.data?.find((one) => one.ref === draft.subraceRef) ?? null,
    [subraces.data, draft.subraceRef],
  );

  /**
   * What the draft cannot know for itself. The race entries are handed over
   * whole, so `racialModifiers` reads bonuses straight off the catalog row.
   */
  const context: DraftContext = useMemo(
    () => ({
      subclassLevel: subclassLevel.data ?? null,
      race: toRacialSource(raceEntry),
      subrace: toRacialSource(subraceEntry),
      // Read off the catalog row the picker already handed over, so the
      // starting hit points need no second lookup.
      hitDie: typeof classEntry?.entry.hit_die === "number" ? classEntry.entry.hit_die : null,
    }),
    [subclassLevel.data, raceEntry, subraceEntry, classEntry],
  );

  const issues = draftIssues(draft, context);
  const issueFor = (code: DraftIssue["code"]) =>
    submitted ? issues.find((one) => one.code === code)?.message : undefined;

  /**
   * The same records `buildCreateInput` will store — computed here only so the
   * spread can show "15 +2 → 17" as it is being edited. Memoised because it
   * rebuilds on every keystroke otherwise.
   */
  const modifiers = useMemo(
    () => racialModifiers({ race: context.race ?? null, subrace: context.subrace ?? null, floating: draft.floating }),
    [context.race, context.subrace, draft.floating],
  );
  const floating = floatingBonusChoices(context.race ?? null);
  const showSubclassField = showsSubclass(draft, context);

  function submit() {
    setSubmitted(true);

    const input = buildCreateInput(draft, context);
    if (!input) {
      return;
    }

    create.mutate(input, {
      onSuccess: (character) => navigate({ to: "/dnd/$characterId", params: { characterId: character.id } }),
    });
  }

  return (
    <form
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <header className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold">New character</h1>
      </header>

      <div className="flex flex-col gap-6 px-4 pb-32">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-sm font-medium">
            Name
          </label>
          <input
            id={nameId}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Bruenor"
            aria-invalid={issueFor("name") ? true : undefined}
            className={cn(
              THUMB_CONTROL,
              "rounded-lg border border-border bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive",
            )}
          />
          <FieldError message={issueFor("name")} />
        </div>

        <PickerField
          label="Class"
          placeholder="Choose a class"
          options={classes.data ?? []}
          pending={classes.isPending}
          authors="classes"
          value={draft.classRef}
          error={issueFor("class")}
          onChange={(classRef) =>
            // The subclass belongs to the old class, so it cannot survive the
            // change — unlike a level drop, where the value is still valid.
            setDraft((current) => ({ ...current, classRef, subclassRef: null }))
          }
        />

        <LevelField
          level={draft.level}
          error={issueFor("level")}
          onChange={(level) => setDraft(setLevel(draft, level))}
        />

        {/*
          Subclass timing is DERIVED from the Levels rows, never hardcoded. Below
          the threshold this field is hidden and any chosen value is KEPT — a
          mis-tap on the level stepper must not throw a choice away.
        */}
        {showSubclassField ? (
          <PickerField
            label="Subclass"
            placeholder="Choose a subclass"
            options={subclasses.data ?? []}
            pending={subclasses.isPending}
            authors="subclasses"
            value={draft.subclassRef}
            error={issueFor("subclass")}
            onChange={(subclassRef) => setDraft((current) => ({ ...current, subclassRef }))}
          />
        ) : null}

        <PickerField
          label="Race"
          placeholder="Choose a race"
          options={races.data ?? []}
          pending={races.isPending}
          authors="races"
          value={draft.raceRef}
          error={issueFor("race")}
          onChange={(raceRef) => setDraft((current) => setRace(current, raceRef))}
        />

        {/* Only four SRD races have subraces; for the rest this simply is not asked. */}
        {(subraces.data ?? []).length > 0 ? (
          <PickerField
            label="Subrace"
            placeholder="Choose a subrace"
            options={subraces.data ?? []}
            authors="subraces"
            value={draft.subraceRef}
            onChange={(subraceRef) => setDraft((current) => ({ ...current, subraceRef }))}
          />
        ) : null}

        {floating ? (
          <FloatingBonusField
            choose={floating.choose}
            bonus={floating.bonus}
            from={floating.from}
            picks={draft.floating}
            error={issueFor("floating")}
            onChange={(picks) => setDraft((current) => ({ ...current, floating: picks }))}
          />
        ) : null}

        <AbilitiesField
          method={draft.abilityMethod}
          draft={draft.abilities}
          modifiers={modifiers}
          error={issueFor("abilities")}
          onMethodChange={(method) => setDraft((current) => setAbilityMethod(current, method))}
          onScoreChange={(abil, score) =>
            setDraft((current) => ({ ...current, abilities: { ...current.abilities, [abil]: score } }))
          }
        />

        {create.isError ? (
          <p role="alert" className="text-sm text-destructive">
            The character could not be saved. Nothing was written.
          </p>
        ) : null}
      </div>

      {/* Bottom-anchored and safe-area padded: the primary action belongs under the thumb. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl gap-2">
          <Button
            render={<Link to="/dnd" />}
            nativeButton={false}
            variant="ghost"
            size="lg"
            className="h-12 flex-1 text-base"
          >
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={create.isPending} className="h-12 flex-[2] text-base">
            Create character
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Level 1–20, stepper-first. Typing is the escape hatch, tapping is the path. */
function LevelField({ level, error, onChange }: { level: number; error?: string; onChange: (level: number) => void }) {
  const fieldId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium">
        Level
      </label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Decrease level"
          disabled={level <= MIN_LEVEL}
          onClick={() => onChange(level - 1)}
          className="size-12"
        >
          <Minus />
        </Button>
        <input
          id={fieldId}
          type="number"
          inputMode="numeric"
          min={MIN_LEVEL}
          max={MAX_LEVEL}
          value={Number.isNaN(level) ? "" : level}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-invalid={error ? true : undefined}
          className={cn(
            THUMB_CONTROL,
            "min-w-0 flex-1 rounded-lg border border-border bg-background text-center text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive",
          )}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Increase level"
          disabled={level >= MAX_LEVEL}
          onClick={() => onChange(level + 1)}
          className="size-12"
        >
          <Plus />
        </Button>
      </div>
      <FieldError message={error} />
    </div>
  );
}

/**
 * The floating racial bonus — Half-Elf's +1/+1 — as a real choice in the data,
 * prompted only when the race declares `ability_bonus_options`. Toggling is
 * capped at `choose`: the oldest pick drops out rather than the tap being
 * rejected, which is what makes changing your mind one tap instead of two.
 */
function FloatingBonusField({
  choose,
  bonus,
  from,
  picks,
  error,
  onChange,
}: {
  choose: number;
  bonus: number;
  from: Abil[];
  picks: Abil[];
  error?: string;
  onChange: (picks: Abil[]) => void;
}) {
  const chosen = picks.filter((abil) => from.includes(abil)).slice(0, choose);

  function toggle(abil: Abil) {
    if (chosen.includes(abil)) {
      onChange(chosen.filter((one) => one !== abil));
      return;
    }
    onChange([...chosen, abil].slice(-choose));
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">
        Racial bonus — choose {choose} (+{bonus} each)
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {ABILITIES.filter((abil) => from.includes(abil)).map((abil) => (
          <Button
            key={abil}
            type="button"
            variant={chosen.includes(abil) ? "default" : "outline"}
            size="lg"
            aria-pressed={chosen.includes(abil)}
            className="h-12 text-sm uppercase"
            onClick={() => toggle(abil)}
          >
            {abil}
          </Button>
        ))}
      </div>
      <FieldError message={error} />
    </section>
  );
}
