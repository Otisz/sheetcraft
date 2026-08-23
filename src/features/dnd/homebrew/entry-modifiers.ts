import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import { mergeModifiers, modifierId } from "@/features/dnd/db/modifier-id";
import type { CharacterRecord, HomebrewEntry, Modifier } from "@/features/dnd/db/schema";
import { isReference, isTarget } from "@/features/dnd/derive";
import { homebrewRefsOf } from "@/features/dnd/homebrew/references";
import type { HomebrewType } from "@/features/dnd/homebrew/types";
import { HOMEBREW_TYPE_ORDER, tableFor } from "@/features/dnd/homebrew/types";
import type { ValidationIssue } from "@/features/dnd/homebrew/validate";

/**
 * Modifier records authored ON a homebrew entry, and how they reach a
 * character. See ADR-0006.
 *
 * The records live in a **side-car**: a `modifiers` key on the stored row,
 * beside `updatedAt` and outside the vendored payload. That placement is the
 * whole decision. The vendored catalog schemas are `z.strictObject`, so a
 * `modifiers` key *inside* the payload fails `validateEntry` outright — and
 * loosening the schema to admit it would retire "entries conform to the same
 * schema as catalog entries", which is what makes homebrew and catalog
 * interchangeable everywhere downstream.
 *
 * A catalog row simply has no side-car, and every function here reads an
 * absent one as an empty list. Nothing branches on where an entry came from.
 */

/**
 * One record as an ENTRY carries it — the record minus the three fields only a
 * character can supply.
 *
 * `id` and `source` are absent because they are derived from the entry the
 * record is attached to, which the record itself does not know: the same
 * authored row on two different entries must become two different records, and
 * an id stored on the entry would make them one. `enabled` is absent because
 * it is the PLAYER's flag, not the author's — see `syncEntryModifiers`, which
 * carries it across a re-sync.
 */
export type EntryModifier = {
  target: string;
  op: Modifier["op"];
  value: Modifier["value"];
  label: string;
};

/**
 * The `homebrew:` provenance namespace.
 *
 * Already in `effects.ts`'s positive list of toggleable sources and already
 * named in CONTEXT.md § Toggle — both written before anything could produce a
 * record under it. This module is what finally does.
 */
const HOMEBREW_NAMESPACE = "homebrew:";

/**
 * The source one entry's records carry: `homebrew:<type>:<index>`.
 *
 * The **type is in the string**, not only the index, because indexes are
 * scoped per table — a subclass and a race may both be `stormborn`, and a
 * source that could not tell them apart would make the two entries' records
 * collide on `modifierId` and silently overwrite each other.
 *
 * It is built from the entry's `index`, which CONTEXT.md § Catalog reference
 * fixes for the entry's whole life. That is what makes the source survive an
 * edit: renaming an entry moves its display name and holds the id still, so
 * the records re-derive onto the same ids and the player's toggle is not lost.
 */
export function entryModifierSource(type: HomebrewType, index: string): string {
  return `${HOMEBREW_NAMESPACE}${type}:${index}`;
}

/**
 * The side-car off a stored row, as a list.
 *
 * Reads defensively rather than trusting the row: a `modifiers` key that is
 * not an array of well-formed records is treated as absent, and a malformed
 * record inside a good array is skipped. A thrown error here would cost the
 * player the character sheet that referenced the entry, which is a far worse
 * outcome than a missing bonus.
 *
 * This is the SECOND check on data `validateEntry` already gated, and the
 * duplication is deliberate rather than redundant: `import.ts` lets an entry
 * through when every complaint is an unknown key (`onlyUnknownKeys`), so a
 * file written by a newer build can reach storage carrying records this build
 * does not understand. Skipping them is quiet, though — an author only learns
 * a record was dropped by reopening the entry, where the editor shows the
 * issue. Worth a surface eventually; not one this ticket builds.
 */
export function entryModifiersOf(entry: Readonly<Record<string, unknown>> | undefined | null): EntryModifier[] {
  if (!entry || !Array.isArray(entry.modifiers)) {
    return [];
  }

  return entry.modifiers.filter((one): one is EntryModifier => validateEntryModifier(one).length === 0);
}

const OPS: readonly Modifier["op"][] = ["add", "set", "min", "max"];

/**
 * One authored record, checked against the same closed vocabularies the
 * derivation engine enforces.
 *
 * Checked HERE rather than left to `derive()` because the two failures are not
 * the same failure. A bad target reaching `derive()` throws a
 * `ModifierValidationError` on the character sheet — at the table, on someone
 * else's device, long after the typo. Caught at authoring time it is a form
 * error next to the field that caused it, which is where a typo is fixable.
 *
 * `attack.<weaponId>.*` passes `isTarget` and is deliberately NOT special-cased
 * out: the weapon id comes from the character's own equipment, so an entry
 * cannot know whether it will resolve — and an unresolved attack target is a
 * miss the sheet renders, not a malformed record. See `targets.ts`.
 */
export function validateEntryModifier(value: unknown): ValidationIssue[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [{ path: "(root)", message: "A modifier must be an object." }];
  }

  const record = value as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  if (typeof record.target !== "string" || !isTarget(record.target)) {
    issues.push({
      path: "target",
      message: `${describe(record.target)} is not a value this sheet computes, so nothing would change if it were saved.`,
    });
  }

  if (typeof record.op !== "string" || !OPS.includes(record.op as Modifier["op"])) {
    issues.push({ path: "op", message: `${describe(record.op)} is not one of add, set, min or max.` });
  }

  issues.push(...valueIssues(record.value));

  if (typeof record.label !== "string" || record.label.trim() === "") {
    issues.push({ path: "label", message: "Give it a label, so the sheet can say where the number came from." });
  }

  return issues;
}

/**
 * A record's value: a number, or a `{ref}` from the closed reference
 * vocabulary. A reference is resolved at derivation time rather than stored as
 * a number, so it never goes stale — a `{ref:'level'}` moves on level-up.
 */
function valueIssues(value: unknown): ValidationIssue[] {
  if (typeof value === "number") {
    return Number.isFinite(value) ? [] : [{ path: "value", message: "A modifier's value must be a real number." }];
  }

  if (typeof value === "object" && value !== null && "ref" in value) {
    const ref = (value as { ref: unknown }).ref;
    if (typeof ref === "string" && isReference(ref)) {
      return [];
    }
    // An EMPTY ref is a box the author has not filled in yet, not a word the
    // vocabulary does not know. Reported as a missing value, because
    // "level, proficiencyBonus, mod.<abil>…" is unhelpful advice to someone
    // who was about to type `2`.
    if (ref === "") {
      return [{ path: "value", message: "Say how much this changes the value by." }];
    }
    return [
      {
        path: "value.ref",
        message: `${describe(ref)} is not something this sheet can look up. Use level, proficiencyBonus, mod.<abil> or score.<abil>.`,
      },
    ];
  }

  return [{ path: "value", message: 'A modifier\'s value must be a number, or a reference like { ref: "mod.con" }.' }];
}

/** An offending value as the message can safely show it. */
function describe(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : "That";
}

/**
 * Every issue in a whole side-car, addressed by position.
 *
 * The path is `modifiers.<n>.<field>`, the same dotted grammar `validateEntry`
 * produces, so the editor's one issue list renders both without knowing which
 * half of the row an issue came from.
 */
export function validateEntryModifiers(value: unknown): ValidationIssue[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return [{ path: "modifiers", message: "Modifiers must be a list." }];
  }

  return value.flatMap((one, position) =>
    validateEntryModifier(one).map((issue) => ({
      path: issue.path === "(root)" ? `modifiers.${position}` : `modifiers.${position}.${issue.path}`,
      message: issue.message,
    })),
  );
}

/**
 * One entry's authored records, as the character records they become.
 *
 * **Seeded enabled**, which is where this parts company with ADR-0004's
 * feature map. An SRD feature is seeded off because it is a situational
 * transcription whose condition the app cannot evaluate — seeding Unarmored
 * Defense on would state an AC the character may not have. An author who wrote
 * "+1 AC" on their own subclass meant +1 AC, and a record that arrives switched
 * off would read as the app having ignored it.
 *
 * The player may still switch it off: `homebrew:` is in `effects.ts`'s
 * toggleable list, so the drawer offers the switch. That is the intended
 * division — the author states what the entry does, the player states whether
 * it currently applies.
 */
export function entryModifiers(
  type: HomebrewType,
  entry: HomebrewEntry | { index: string; modifiers?: unknown },
): Modifier[] {
  const source = entryModifierSource(type, entry.index);
  const modifiers: Modifier[] = [];
  const taken = new Set<string>();

  for (const authored of entryModifiersOf(entry)) {
    const id = modifierId(source, authored.target);
    // Two records on one entry targeting the same value would share an id, and
    // the second would be indistinguishable from the first on the character.
    // The first wins, matching `featureModifiers`.
    if (taken.has(id)) {
      continue;
    }
    taken.add(id);

    modifiers.push({
      id,
      source,
      target: authored.target,
      op: authored.op,
      value: authored.value,
      enabled: true,
      label: authored.label,
    });
  }

  return modifiers;
}

/**
 * Re-derives ONE entry's records on a character.
 *
 * The merge and its three rules are `mergeModifiers`; what this adds is the
 * scope — the records of exactly one entry, identified by their source.
 */
export function syncEntryModifiers(
  modifiers: readonly Modifier[],
  type: HomebrewType,
  entry: HomebrewEntry | { index: string; modifiers?: unknown },
): Modifier[] {
  const source = entryModifierSource(type, entry.index);

  // Scoped to ONE source, which is what keeps two entries independent: a
  // character with a homebrew race and a homebrew subclass has two sets, and
  // editing one entry must not disturb the other.
  return mergeModifiers(modifiers, (one) => one.source === source, entryModifiers(type, entry));
}

/**
 * Whether two record lists differ, positionally.
 *
 * Asked so an entry edit that touched only prose does not restamp `updatedAt`
 * on every character referencing it — which would reorder the character list
 * for a change none of them can see.
 *
 * **Order-sensitive**, which is sound only because the merge is: it rebuilds
 * the list as `[...kept, ...rederived]` from stable ids, so an unchanged entry
 * reproduces the same order every time. A reordering therefore IS a change
 * worth writing, not a false positive.
 */
function modifierListsDiffer(before: readonly Modifier[], after: readonly Modifier[]): boolean {
  if (before.length !== after.length) {
    return true;
  }
  return before.some((one, position) => JSON.stringify(one) !== JSON.stringify(after[position]));
}

/**
 * A character's records brought back into agreement with one entry.
 *
 * Returns `null` when nothing moved, so the caller can skip the write rather
 * than compare records itself.
 */
export function resyncCharacter(
  character: CharacterRecord,
  type: HomebrewType,
  entry: HomebrewEntry,
): CharacterRecord | null {
  const modifiers = syncEntryModifiers(character.modifiers, type, entry);
  return modifierListsDiffer(character.modifiers, modifiers) ? { ...character, modifiers } : null;
}

/**
 * Every homebrew entry a character references, with its records re-derived
 * onto them.
 *
 * The traversal is `homebrewRefsOf`, the same walk the delete block uses, so
 * "which entries does this character take" has one answer rather than two that
 * drift. A type whose entry has no side-car contributes nothing and costs one
 * lookup, which is why this needs no list of "types that can carry modifiers".
 *
 * Runs over all seven types rather than the one that changed, because it is
 * also the CREATE path: a new character resolves every ref it was given at
 * once, and a per-type version would have to be called seven times by a caller
 * that then owns the ordering.
 *
 * Called by `createCharacter` and by `updateCharacterRefs` — the two places a
 * character's refs are set. ADR-0006 recorded the first as the only one,
 * because nothing then changed a character's refs after creation; #176 built
 * the surface that does, and wired it here rather than leaving a homebrew item
 * acquired later contributing nothing until its entry was next saved. See
 * ADR-0007.
 *
 * **Records whose entry is no longer referenced are swept**, which is what
 * makes dropping an item the mirror of acquiring one. The per-entry merge
 * cannot do it: `mergeModifiers` only drops records belonging to a source it
 * is *given*, and a dropped item is precisely an entry this walk no longer
 * visits. So its records would sit on the character forever — a number the
 * sheet cannot explain, from an item the player is not carrying.
 */
export async function syncAllEntryModifiers(
  character: CharacterRecord,
  db: SheetcraftDb = getDb(),
): Promise<Modifier[]> {
  let modifiers = character.modifiers;
  // The sources this character's CURRENT refs justify. Anything under the
  // `homebrew:` namespace outside this set belongs to an entry the character
  // no longer references, and is swept below.
  const live = new Set<string>();

  for (const type of HOMEBREW_TYPE_ORDER) {
    const indices = homebrewRefsOf(character, type);
    if (indices.length === 0) {
      continue;
    }

    const rows = (await db.table(tableFor(type)).bulkGet(indices)) as (HomebrewEntry | undefined)[];
    for (const [position, row] of rows.entries()) {
      // A ref pointing at an entry that is gone is a DANGLING ref, which the
      // sheet already renders as `⚠ unknown`. Its records are dropped rather
      // than kept, by syncing against an entry with an empty side-car: a
      // number left on the sheet by an entry nobody can open is one nothing
      // can explain.
      const index = indices[position];
      live.add(entryModifierSource(type, index));
      modifiers = syncEntryModifiers(modifiers, type, row ?? { index });
    }
  }

  // The sweep. Scoped to sources this mechanism actually OWNS — the
  // `homebrew:<type>:<index>` grammar `entryModifierSource` writes — and to
  // those no current ref justifies.
  //
  // The type segment is what makes the scope checkable, and it is load-bearing
  // rather than decorative. A record may carry a `homebrew:` source without
  // having come from an entry side-car at all: `createCharacter` accepts
  // author-supplied records, and a two-segment `homebrew:azure-ward` is a
  // record this walk did not write and must not delete. Matching the whole
  // namespace would sweep it away on the character's first loadout change.
  return modifiers.filter((one) => !isEntryAuthoredSource(one.source) || live.has(one.source));
}

/**
 * Whether a source names an entry's side-car — `homebrew:<type>:<index>`, with
 * a type segment from the closed set of authorable types.
 *
 * The check exists so the sweep can tell records it wrote from records that
 * merely share the `homebrew:` prefix. Anything else under that namespace
 * belongs to whoever put it there.
 */
function isEntryAuthoredSource(source: string): boolean {
  if (!source.startsWith(HOMEBREW_NAMESPACE)) {
    return false;
  }

  const rest = source.slice(HOMEBREW_NAMESPACE.length);
  const separator = rest.indexOf(":");
  if (separator === -1) {
    return false;
  }

  return (HOMEBREW_TYPE_ORDER as readonly string[]).includes(rest.slice(0, separator));
}
