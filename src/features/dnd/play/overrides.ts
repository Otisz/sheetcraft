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
import { ABILITIES, type Abil, type Modifier } from "@/features/dnd/db/schema";
import { DERIVED_TARGETS, type Derived, type EnumerableTarget, isTarget, type Skill } from "@/features/dnd/derive";
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
 * The ten values that render only on the play header, and therefore have no tab
 * to be tapped on. Listed rather than derived, because "what the header renders"
 * is a fact about `character-sheet.tsx` that no data structure here can observe —
 * the partition test is what keeps the list honest.
 */
const MENU_TARGETS = new Set<string>([
  "ac",
  "initiative",
  "speed",
  "proficiencyBonus",
  ...ABILITIES.map((abil) => `ability.${abil}`),
]);

/** The tab each remaining scalar renders on. Saves and skills are handled by prefix. */
const SCALAR_SURFACES: Record<string, OverrideSurface> = {
  // Beside the per-level rolls it is the sum of, on Combat — not the header HP
  // row, which is play state and stays a numpad.
  maxHp: "combat",
  passivePerception: "skills",
  "spell.saveDc": "spells",
  "spell.attack": "spells",
};

/**
 * Which surface offers a target, or `undefined` for something outside the
 * overridable vocabulary.
 *
 * Total over `OVERRIDE_TARGETS` by construction, and the partition test in
 * `overrides.test.ts` is what proves it stays that way when a target is added.
 */
export function overrideSurface(target: string): OverrideSurface | undefined {
  if (MENU_TARGETS.has(target)) {
    return "menu";
  }
  if (SCALAR_SURFACES[target]) {
    return SCALAR_SURFACES[target];
  }
  return target.startsWith("save.") || target.startsWith("skill.") ? "skills" : undefined;
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
 * Exists because **the target vocabulary and the derived field names are not
 * the same spelling**: `ac` is `armorClass`, `spell.saveDc` is `spellSaveDc`.
 * Every surface needs the translation, and a copy per surface is a copy that
 * gets one of the two mismatched pairs wrong.
 *
 * An `ability.*` target reads the **score**, not the modifier: that is what the
 * target addresses, and pre-filling the editor with the modifier would invite
 * the player to overwrite a 16 with a 3.
 */
export function derivedValueFor(derived: Derived, target: string): number {
  switch (target) {
    case "ac":
      return derived.armorClass;
    case "maxHp":
      return derived.maxHp;
    case "initiative":
      return derived.initiative;
    case "speed":
      return derived.speed;
    case "proficiencyBonus":
      return derived.proficiencyBonus;
    case "passivePerception":
      return derived.passivePerception;
    // `null` for a non-caster. An override still needs a number to start from,
    // and 0 is what the sheet is currently claiming — which is nothing.
    case "spell.saveDc":
      return derived.spellSaveDc ?? 0;
    case "spell.attack":
      return derived.spellAttackBonus ?? 0;
    default:
      break;
  }

  const [kind, rest] = [target.slice(0, target.indexOf(".")), target.slice(target.indexOf(".") + 1)];
  if (kind === "ability") {
    return derived.abilityScores[rest as Abil];
  }
  if (kind === "save") {
    return derived.saves[rest as Abil];
  }
  if (kind === "skill") {
    return derived.skills[rest as Skill];
  }

  // Unreachable for an overridable target — the coverage test proves it — so a
  // miss here is a target added to the vocabulary and forgotten about, not a
  // number the sheet should invent.
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
