/**
 * Creating an override — the half of the mechanism that did not exist.
 *
 * Everything else about overrides predates this module: `resolve()` short-circuits
 * on `source: "override"` before any phase, `derive()` rejects a non-`set` one as
 * a validation error, `StatTile` renders the amber marker, and `clearOverride()`
 * deletes the record. What was missing was any surface that *wrote* one, so the
 * whole feature was reachable only from a test. See CONTEXT.md § Override.
 *
 * Two things live here, and the second is the load-bearing one:
 *
 * - **`setOverride`** — the write, in one place so the `op: "set"` rule and the
 *   last-wins rule cannot be spelled two ways.
 * - **The surface map** — which of the two creation surfaces offers each target.
 *   An override the player can create but cannot *see* is worse than no override,
 *   so creation coverage and marker coverage are the same list rather than two
 *   that drift. See ADR-0005.
 *
 * Pure — no React, no Dexie, like the rest of `play/`.
 */
import { modifierId } from "@/features/dnd/db/modifier-id";
import type { Abil, Modifier } from "@/features/dnd/db/schema";
import {
  DERIVED_TARGETS,
  type Derived,
  type EnumerableTarget,
  isTarget,
  type ScalarTarget,
  type Skill,
} from "@/features/dnd/derive";
import { targetLabel } from "@/features/dnd/play/effects";

/** The provenance every override carries. The resolver keys off this exact string. */
const OVERRIDE_SOURCE = "override";

/**
 * Where a player creates an override.
 *
 * Four surfaces rather than one because 28 of the 38 targets already render on
 * a tab, and moving those three taps away to a drawer would be the very cost
 * #171 raised against doing it that way. The remaining ten render only on the
 * play header, which is deliberately untappable — so they get the `⋯` menu,
 * which is the door edit-by-separation designates for character data.
 */
export const OVERRIDE_SURFACES = ["skills", "combat", "spells", "menu"] as const;

export type OverrideSurface = (typeof OVERRIDE_SURFACES)[number];

/**
 * Every target that can be overridden — the enumerable vocabulary exactly.
 *
 * The `attack.*` family is absent, and that absence is deliberate rather than an
 * oversight: its keys come from the character's own equipment, so no surface can
 * enumerate them, and a target no surface enumerates is one whose override would
 * render with no marker. `setOverride` rejects it for the same reason.
 */
export const OVERRIDE_TARGETS: readonly EnumerableTarget[] = DERIVED_TARGETS;

/**
 * **The eight scalar targets: where each is offered, and how each is read.**
 *
 * One table rather than three, and that is the point. The surface map, the
 * header-only list and the `derived`-field lookup each used to enumerate these
 * eight separately, so adding a scalar target meant remembering three places —
 * and the two that disagree silently are the surface (a value with no way to be
 * set) and the reader (an editor that opens on `undefined`).
 *
 * `read` exists because **the target vocabulary and the derived field names are
 * not the same spelling**: `ac` is `armorClass`, `spell.saveDc` is
 * `spellSaveDc`. Keeping the two beside each other is what stops one being
 * renamed without the other.
 *
 * The parameterised families — `ability.*`, `save.*`, `skill.*` — are absent on
 * purpose. They are a *rule* (prefix → surface, prefix → record) rather than
 * thirty entries, and listing them would be the restatement this table exists
 * to remove.
 */
const SCALAR_TARGET_INFO: Record<ScalarTarget, { surface: OverrideSurface; read: (derived: Derived) => number }> = {
  // The four the play header renders and nothing else does. They have no tab to
  // be tapped on, so the `⋯` drawer is the only surface that can offer them.
  ac: { surface: "menu", read: (derived) => derived.armorClass },
  initiative: { surface: "menu", read: (derived) => derived.initiative },
  speed: { surface: "menu", read: (derived) => derived.speed },
  proficiencyBonus: { surface: "menu", read: (derived) => derived.proficiencyBonus },

  // Beside the per-level rolls it is the sum of, on Combat — not the header HP
  // row, which is play state and stays a numpad.
  maxHp: { surface: "combat", read: (derived) => derived.maxHp },
  passivePerception: { surface: "skills", read: (derived) => derived.passivePerception },

  // `null` for a non-caster. An override still needs a number to start from,
  // and 0 is what the sheet is currently claiming — which is nothing.
  "spell.saveDc": { surface: "spells", read: (derived) => derived.spellSaveDc ?? 0 },
  "spell.attack": { surface: "spells", read: (derived) => derived.spellAttackBonus ?? 0 },
};

/**
 * The parameterised families: prefix → the surface that renders them, and how
 * one is read off `derived`.
 *
 * `ability.*` reads the **score**, not the modifier: that is what the target
 * addresses, and pre-filling the editor with the modifier would invite the
 * player to overwrite a 16 with a 3.
 */
const FAMILY_INFO = {
  // `ability.*` renders only on the play header's six-column grid — never on a
  // tab — so it goes to the drawer, unlike the two families it shares a prefix
  // rule with.
  ability: { surface: "menu", read: (derived: Derived, key: string) => derived.abilityScores[key as Abil] },
  save: { surface: "skills", read: (derived: Derived, key: string) => derived.saves[key as Abil] },
  skill: { surface: "skills", read: (derived: Derived, key: string) => derived.skills[key as Skill] },
} as const satisfies Record<string, { surface: OverrideSurface; read: (derived: Derived, key: string) => number }>;

/** Splits `skill.stealth` into `["skill", "stealth"]`; `null` for an unparameterised target. */
function splitTarget(target: string): [kind: string, key: string] | null {
  const dot = target.indexOf(".");
  return dot === -1 ? null : [target.slice(0, dot), target.slice(dot + 1)];
}

/**
 * Which surface offers a target, or `undefined` for something outside the
 * overridable vocabulary.
 *
 * Takes a bare `string` deliberately: this is the validating boundary, called
 * with stored and imported targets that have not been checked yet. Narrowing
 * the parameter would defeat the check it exists to perform.
 *
 * Total over `OVERRIDE_TARGETS` by construction, and the partition test in
 * `overrides.test.ts` is what proves it stays that way when a target is added.
 */
export function overrideSurface(target: string): OverrideSurface | undefined {
  if (Object.hasOwn(SCALAR_TARGET_INFO, target)) {
    return SCALAR_TARGET_INFO[target as ScalarTarget].surface;
  }

  const split = splitTarget(target);
  if (!split) {
    return undefined;
  }

  const [kind] = split;
  return Object.hasOwn(FAMILY_INFO, kind) ? FAMILY_INFO[kind as keyof typeof FAMILY_INFO].surface : undefined;
}

/** Whether a stored string names something a player can override *and see*. */
export function isOverridable(target: string): target is EnumerableTarget {
  return overrideSurface(target) !== undefined;
}

/** The targets one surface offers, in vocabulary order. */
export function targetsForSurface(surface: OverrideSurface): EnumerableTarget[] {
  return OVERRIDE_TARGETS.filter((target) => overrideSurface(target) === surface);
}

/**
 * **The components that render each surface's marker**, named so the claim is
 * checkable rather than assumed.
 *
 * The same lesson as `CHARACTER_FIELD_HOMES`: an earlier version of that map
 * recorded only where a field lived, and five fields sat in it with no pixels
 * behind them — the coverage test passed on the map entry alone. Here the
 * failure would be worse than an invisible field: an override the player can
 * create but cannot *see* leaves the sheet showing a hand-set number with
 * nothing saying so, which is the one thing #171 rules out.
 *
 * `overrides.test.ts` reads these files and asserts each component exists and
 * actually references the marker, so a surface cannot gain a way to set a value
 * without gaining a way to show that it was set.
 */
export const MARKER_RENDERERS: Record<OverrideSurface, { file: string; components: readonly string[] }> = {
  skills: { file: "skills-tab.tsx", components: ["PassivePerception", "Row"] },
  combat: { file: "combat-tab.tsx", components: ["HitPointRolls"] },
  spells: { file: "spells-tab.tsx", components: ["Tile"] },
  menu: { file: "overrides-drawer.tsx", components: ["OverrideRow"] },
};

/**
 * The play header renders four of the `menu` targets and all six abilities, and
 * must mark them too — the drawer is where they are *set*, but the header is
 * where they are *read*, and an unmarked 17 on the header is the silent hand-set
 * number regardless of which surface produced it.
 */
export const HEADER_MARKER_RENDERERS = {
  file: "character-sheet.tsx",
  components: ["StatTile", "Abilities"],
} as const;

/**
 * What a target currently derives to — the number the editor pre-fills, and
 * the one clearing returns the sheet to.
 *
 * Reads the same two tables `overrideSurface` partitions on, so a target cannot
 * have a surface without also having a reader. Before, this was a switch over
 * the eight scalars plus its own `kind` cascade — a third enumeration of what
 * those tables already said, and the copy most likely to be the one forgotten.
 *
 * Takes an `EnumerableTarget` rather than a `string`: every caller reaches it
 * from `targetsForSurface` or from a surface's own literal, all of which are
 * already known-good. The throw below is the boundary for a target added to the
 * vocabulary and forgotten here, not for user input.
 */
export function derivedValueFor(derived: Derived, target: EnumerableTarget): number {
  if (Object.hasOwn(SCALAR_TARGET_INFO, target)) {
    return SCALAR_TARGET_INFO[target as ScalarTarget].read(derived);
  }

  const split = splitTarget(target);
  if (split && Object.hasOwn(FAMILY_INFO, split[0])) {
    return FAMILY_INFO[split[0] as keyof typeof FAMILY_INFO].read(derived, split[1]);
  }

  // Unreachable through the type system — `EnumerableTarget` rejects
  // `attack.*` and anything malformed at the call site — and unreachable for a
  // valid target too, which the coverage test proves. Kept because the union is
  // of string literals: a cast, or a value widened to `string` somewhere
  // upstream, would still arrive here. A throw is the honest answer then; a
  // number the sheet invented is not.
  throw new Error(`No derived value for ${target}`);
}

/** The override in force on a target, if any. */
export function overrideFor(modifiers: Modifier[], target: string): Modifier | undefined {
  // Last wins, matching resolution: a second override is the player changing
  // their mind, not an error to block. Walked backwards rather than through
  // `findLast`, which the configured lib does not carry. See CONTEXT.md § Override.
  for (let index = modifiers.length - 1; index >= 0; index -= 1) {
    const modifier = modifiers[index];
    if (modifier.source === OVERRIDE_SOURCE && modifier.target === target) {
      return modifier;
    }
  }
  return undefined;
}

/**
 * Sets an override on a target, returning a new modifier list.
 *
 * **Replaces rather than appends.** Resolution is last-wins either way, so a
 * stacked list would derive the same number — but it would also grow without
 * bound and give `clearOverride` several records to delete where the player
 * sees one value. One target, one record.
 *
 * Rejects rather than coerces on bad input, the way `derive()` rejects a
 * malformed modifier: a record that silently does nothing is a wrong number at
 * the table with no way to notice.
 */
export function setOverride(modifiers: Modifier[], target: string, value: number): Modifier[] {
  if (!Number.isFinite(value)) {
    throw new Error(`Override on ${target}: value must be finite, got ${value}`);
  }
  if (!isTarget(target)) {
    throw new Error(`Override on ${target}: not a target this engine derives`);
  }
  if (!isOverridable(target)) {
    // Reachable only for the `attack.*` family — a real target, but one no
    // surface enumerates, so an override on it would show no marker.
    throw new Error(`Override on ${target}: no surface renders this value, so an override would be invisible`);
  }

  const override: Modifier = {
    id: modifierId(OVERRIDE_SOURCE, target),
    source: OVERRIDE_SOURCE,
    target,
    // Enforced, not conventional: resolution treats an override as a `set`
    // regardless, and honouring something the record does not say is how a
    // sheet starts lying. See CONTEXT.md § Override.
    op: "set",
    value,
    enabled: true,
    label: `${targetLabel(target)} set to ${value}`,
  };

  return [...modifiers.filter((one) => !(one.source === OVERRIDE_SOURCE && one.target === target)), override];
}
