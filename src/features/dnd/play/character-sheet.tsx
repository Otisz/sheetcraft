import { Link } from "@tanstack/react-router";
import { ChevronLeft, MoreVertical, X } from "lucide-react";
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
import { ABILITIES, type CharacterRecord, type Modifier, type Ref } from "@/features/dnd/db/schema";
import type { Derived, DerivedTarget } from "@/features/dnd/derive";
import { derive } from "@/features/dnd/derive";
import type { DeathSaves } from "@/features/dnd/play/death-saves";
import { activeOverrides, clearOverride } from "@/features/dnd/play/effects";
import { EffectsRow } from "@/features/dnd/play/effects-row";
import type { HpPool } from "@/features/dnd/play/hp";
import { HpSection } from "@/features/dnd/play/hp-row";
import { useDeriveContext, useUpdateModifiers, useUpdatePlay } from "@/features/dnd/play/queries";
import { cn, THUMB_ACTION } from "@/lib/utils";

/**
 * Play mode — the part of the sheet used mid-combat.
 *
 * **Accidental edits are prevented by separation, not by a lock.** Character
 * data is not tappable here at all: ability scores, class and race render as
 * plain text, and editing lives behind the `⋯` menu. Only play state — hit
 * points, effect toggles, conditions — is directly mutable.
 *
 * That is the prototype's conclusion after five rounds on a phone: a mode you
 * can forget to re-enter is worse than a surface that never exposes the data.
 * See the decision on #150.
 */

export function CharacterSheet({ character }: { character: CharacterRecord }) {
  const context = useDeriveContext(character);
  const updatePlay = useUpdatePlay();
  const updateModifiers = useUpdateModifiers();

  if (context.isPending) {
    return (
      <output aria-live="polite" className="flex min-h-dvh items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading the sheet…</p>
      </output>
    );
  }

  if (context.isError || !context.data) {
    return <SheetFailed onRetry={() => void context.refetch()} />;
  }

  return (
    <SheetBody
      character={character}
      derived={derive(character, context.data)}
      onPlayChange={updatePlay.mutate}
      onModifiersChange={updateModifiers.mutate}
    />
  );
}

function SheetBody({
  character,
  derived,
  onPlayChange,
  onModifiersChange,
}: {
  character: CharacterRecord;
  derived: Derived;
  onPlayChange: (input: { id: string; play: CharacterRecord["play"] }) => void;
  onModifiersChange: (input: { id: string; modifiers: Modifier[] }) => void;
}) {
  const overrides = activeOverrides(character);

  function writePlay(play: Partial<CharacterRecord["play"]>) {
    onPlayChange({ id: character.id, play: { ...character.play, ...play } });
  }

  return (
    // `pb-` leaves room under the last section; nothing here is laid out wider
    // than the viewport, so the page never scrolls horizontally.
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-12">
      <Identity character={character} />

      <HpSection
        pool={{ currentHp: character.play.currentHp, tempHp: character.play.tempHp }}
        maxHp={derived.maxHp}
        deathSaves={character.play.deathSaves}
        onPoolChange={(pool: HpPool, deathSaves?: DeathSaves) =>
          writePlay({
            currentHp: pool.currentHp,
            tempHp: pool.tempHp,
            ...(deathSaves ? { deathSaves } : {}),
          })
        }
        onDeathSavesChange={(deathSaves) => writePlay({ deathSaves })}
      />

      <KeyStats
        derived={derived}
        overrides={overrides}
        onClearOverride={(target) =>
          onModifiersChange({ id: character.id, modifiers: clearOverride(character.modifiers, target) })
        }
      />

      <Abilities derived={derived} />

      <EffectsRow
        character={character}
        onModifiersChange={(modifiers) => onModifiersChange({ id: character.id, modifiers })}
        onConditionsChange={(conditions: Ref[]) => writePlay({ conditions })}
      />
    </div>
  );
}

/** Identity, and the `⋯` menu that is the only door to editing this character. */
function Identity({ character }: { character: CharacterRecord }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex items-start gap-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <Link to="/dnd" className="mb-1 inline-flex items-center gap-1 self-start text-sm text-muted-foreground">
          <ChevronLeft className="size-4" />
          Characters
        </Link>
        <h1 className="truncate text-2xl font-bold">{character.name}</h1>
        <p className="text-sm text-muted-foreground">Level {character.level}</p>
      </div>

      <Button
        variant="ghost"
        size="icon-lg"
        className="mt-6 shrink-0"
        aria-label={`Actions for ${character.name}`}
        onClick={() => setMenuOpen(true)}
      >
        <MoreVertical />
      </Button>

      <CharacterMenu character={character} open={menuOpen} onOpenChange={setMenuOpen} />
    </header>
  );
}

/**
 * Edit · Duplicate · Delete. All three belong to later tickets; the menu ships
 * now because it is the *mechanism* that keeps character data off the play
 * surface, and a play screen with no door to editing is not the design.
 */
function CharacterMenu({
  character,
  open,
  onOpenChange,
}: {
  character: CharacterRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="truncate">{character.name}</DrawerTitle>
          <DrawerDescription>Editing this character lives here, off the play surface.</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="pt-4">
          {/*
            Disabled rather than absent: the menu is the answer to "where do I
            edit this?", and an empty drawer answers nothing. Each lands with
            its own ticket.
          */}
          <Button variant="outline" size="lg" className={THUMB_ACTION} disabled>
            Edit character
          </Button>
          <Button variant="outline" size="lg" className={THUMB_ACTION} disabled>
            Duplicate
          </Button>
          <Button variant="destructive" size="lg" className={THUMB_ACTION} disabled>
            Delete
          </Button>
          <DrawerClose render={<Button variant="ghost" size="lg" className={THUMB_ACTION} />}>Cancel</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** AC · Init · Speed · Prof — the four numbers reached for most often. */
function KeyStats({
  derived,
  overrides,
  onClearOverride,
}: {
  derived: Derived;
  overrides: Map<string, Modifier>;
  onClearOverride: (target: string) => void;
}) {
  const stats: { target: DerivedTarget; label: string; value: string }[] = [
    { target: "ac", label: "AC", value: String(derived.armorClass) },
    { target: "initiative", label: "Init", value: signed(derived.initiative) },
    { target: "speed", label: "Speed", value: `${derived.speed} ft` },
    { target: "proficiencyBonus", label: "Prof", value: signed(derived.proficiencyBonus) },
  ];

  return (
    <section aria-label="Key stats" className="grid grid-cols-4 gap-2">
      {stats.map((stat) => (
        <StatTile
          key={stat.target}
          label={stat.label}
          value={stat.value}
          override={overrides.get(stat.target)}
          onClearOverride={() => onClearOverride(stat.target)}
        />
      ))}
    </section>
  );
}

/**
 * One key stat. An overridden value carries a visible amber marker and a way to
 * clear it — clearing means deleting the record, which is the only mechanism an
 * override has. See CONTEXT.md § Override.
 */
function StatTile({
  label,
  value,
  override,
  onClearOverride,
}: {
  label: string;
  value: string;
  override: Modifier | undefined;
  onClearOverride: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border bg-card px-1 py-3",
        override ? "border-amber-500" : "border-border",
      )}
    >
      <span className="text-[0.7rem] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-xl font-bold tabular-nums">{value}</span>
      {override ? (
        <button
          type="button"
          onClick={onClearOverride}
          className="mt-0.5 inline-flex items-center gap-0.5 text-[0.65rem] text-amber-600 dark:text-amber-400"
        >
          overridden
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * The six abilities — **read-only here**. Not a disabled input, not a
 * long-press: plain text, so there is no affordance to mis-tap. Editing them is
 * behind the `⋯` menu, which is the whole point of the separation.
 */
function Abilities({ derived }: { derived: Derived }) {
  return (
    <section aria-label="Ability scores" className="grid grid-cols-6 gap-1.5">
      {ABILITIES.map((abil) => (
        <div key={abil} className="flex flex-col items-center rounded-xl border border-border bg-card px-0.5 py-2.5">
          <span className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">{abil}</span>
          <span className="text-lg font-bold tabular-nums">{signed(derived.abilityModifiers[abil])}</span>
          <span className="text-[0.7rem] text-muted-foreground tabular-nums">{derived.abilityScores[abil]}</span>
        </div>
      ))}
    </section>
  );
}

/** A modifier reads `+3` or `−1`; a bare `3` is ambiguous on a character sheet. */
function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function SheetFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium">This sheet could not be worked out.</p>
      <p className="max-w-prose text-sm text-muted-foreground">
        The catalog data behind it did not load. Nothing has been lost.
      </p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}
