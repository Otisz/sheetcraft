/**
 * The projections behind the Spells and Bio tabs.
 *
 * Pure, and separated from the components for the reason the rest of `play/`
 * is: the interesting decisions here are about what a tab says when it has
 * nothing to show, and a decision buried in JSX is one nothing can test.
 */
import { refIndex } from "@/features/dnd/db/resolve-ref";
import type { CharacterProficiencies, CharacterRecord, Ref } from "@/features/dnd/db/schema";
import type { SpellSlotPool } from "@/features/dnd/derive";

/** One spell on the Spells tab. */
export type SpellEntry = {
  ref: Ref;
  /** The entry's `index`, for looking the name up in the catalog. */
  index: string;
  prepared: boolean;
};

/** What the Spells tab renders, empty state included. */
export type SpellSection = {
  slots: SpellSlotPool[];
  cantripsKnown: number;
  spells: SpellEntry[];
  /** Whether this character has no spellcasting at all. */
  empty: boolean;
  /** The line shown when `empty` — always a sentence, never a blank panel. */
  emptyMessage: string;
};

export type SpellSectionInput = {
  /** The class's display name, or `null` when its ref does not resolve. */
  className: string | null;
  slots: SpellSlotPool[];
  cantripsKnown: number;
  known: Ref[];
  prepared: Ref[];
};

/**
 * The Spells tab's contents.
 *
 * **The section is always present, including for a non-caster.** A barbarian
 * sees "No spells or cantrips — Barbarian grants none": some classes gain
 * cantrips from a subclass, so a section that disappeared would be
 * undiscoverable, and a player whose spells were genuinely lost could not tell
 * that from a UI that simply hid them. See #164.
 *
 * The empty message names the class rather than saying "no spells", because
 * the question a player is actually asking is whether the app lost them.
 */
export function spellSection(input: SpellSectionInput): SpellSection {
  const prepared = new Set(input.prepared);

  // `prepared` is not a subset of `known`: a cleric prepares from the whole
  // class list rather than from a known list, so a prepared spell can be absent
  // from `known` entirely. Union rather than filter, or the sheet hides a spell
  // the player prepared.
  const refs = [...new Set([...input.known, ...input.prepared])];

  const spells = refs.flatMap((ref) => {
    const index = refIndex(ref);
    return index ? [{ ref, index, prepared: prepared.has(ref) }] : [];
  });

  // Slots or cantrips alone are spellcasting — the player has somewhere to put
  // a spell. Only a character with neither, and no spells, is genuinely a
  // non-caster.
  const empty = input.slots.length === 0 && input.cantripsKnown === 0 && spells.length === 0;

  return {
    slots: input.slots,
    cantripsKnown: input.cantripsKnown,
    spells,
    empty,
    emptyMessage: `No spells or cantrips — ${input.className ?? "this class"} grants none.`,
  };
}

/** The proficiency kinds that carry refs — every kind but `saves`, which carries abilities. */
export type ProficiencyKind = "armor" | "weapons" | "tools" | "languages" | "skills";

/** One entry in a proficiency group. */
export type ProficiencyEntry = {
  ref: Ref;
  index: string;
};

export type ProficiencyGroup = {
  kind: ProficiencyKind;
  label: string;
  entries: ProficiencyEntry[];
};

/**
 * The kinds Bio groups by, in the order it lists them, with their headings.
 *
 * `saves` is deliberately absent: saving throws are abilities rather than refs,
 * and they head the Skills tab beside the numbers they move. `expertise` is
 * absent too — it is a property of a skill proficiency, not a kind of its own,
 * and the Skills tab marks it there.
 */
const PROFICIENCY_KINDS: readonly { kind: ProficiencyKind; label: string }[] = [
  { kind: "armor", label: "Armor" },
  { kind: "weapons", label: "Weapons" },
  { kind: "tools", label: "Tools" },
  { kind: "languages", label: "Languages" },
  { kind: "skills", label: "Skills" },
];

/**
 * Proficiencies grouped by kind, for the Bio tab.
 *
 * An empty kind keeps its heading rather than being dropped: "Tools: none" is
 * information, while a missing heading is a question. A malformed ref is
 * dropped, because a row the app cannot name is worse than one fewer row.
 */
export function groupProficiencies(character: { proficiencies: CharacterProficiencies }): ProficiencyGroup[] {
  return PROFICIENCY_KINDS.map(({ kind, label }) => ({
    kind,
    label,
    entries: character.proficiencies[kind].flatMap((ref) => {
      const index = refIndex(ref);
      return index ? [{ ref, index }] : [];
    }),
  }));
}

/**
 * The line under a character's name: `Level 3 Dwarf (Hill Dwarf) Barbarian
 * (Path of the Berserker)`.
 *
 * Exists because class, subclass, race and subrace were reachable *nowhere* in
 * the UI until it did — each had a home in the tab map and no pixels behind it,
 * which is the failure mode the map is supposed to catch. See #164's "every
 * field in the character record is reachable" criterion.
 *
 * A ref that has not resolved yet is skipped rather than rendered as a marker:
 * this line is read at a glance, and a ⚠ that disappears a moment later is
 * noise. An unresolvable ref still shows through the Bio tab.
 */
export function describeCharacter(
  character: Pick<CharacterRecord, "level" | "classRef" | "subclassRef" | "raceRef" | "subraceRef">,
  names: Partial<Record<string, string>>,
): string {
  const race = qualified(names[character.raceRef], character.subraceRef ? names[character.subraceRef] : undefined);
  const klass = qualified(names[character.classRef], character.subclassRef ? names[character.subclassRef] : undefined);

  return [`Level ${character.level}`, race, klass].filter(Boolean).join(" ");
}

/** `Dwarf (Hill Dwarf)`, or just `Dwarf` when the subtype has no name yet. */
function qualified(name: string | undefined, sub: string | undefined): string {
  if (!name) {
    return "";
  }
  return sub ? `${name} (${sub})` : name;
}
