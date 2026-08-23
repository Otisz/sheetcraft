import type { FeatureSource } from "@/features/dnd/creation/feature-modifiers";
import { syncFeatureModifiers } from "@/features/dnd/creation/feature-modifiers";
import { loadClassFeatures } from "@/features/dnd/db/class-features";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import type { Abil, CharacterRecord, Modifier, Ref } from "@/features/dnd/db/schema";
import { ABILITIES } from "@/features/dnd/db/schema";
import { derive, EMPTY_CONTEXT } from "@/features/dnd/derive";
import { syncAllEntryModifiers } from "@/features/dnd/homebrew/entry-modifiers";
import { HOMEBREW_TYPE_ORDER, tableFor } from "@/features/dnd/homebrew/types";

/**
 * The repository seam over Dexie. Everything above it — routes, the sheet,
 * the creation flow — goes through these functions, so the tests exercise the
 * same code the UI does, with `fake-indexeddb` underneath and no UI involved.
 */

/** What a caller must supply to create a character. Everything else is defaulted. */
export type CreateCharacterInput = {
  name: string;
  level: number;
  classRef: Ref;
  raceRef: Ref;
  subclassRef?: Ref | null;
  subraceRef?: Ref | null;
  backgroundRef?: Ref | null;
  alignment?: string | null;
  abilities?: Partial<Record<Abil, number>>;
  hpRolls?: number[];
  /**
   * Racial bonuses and anything else the creation flow derives from the
   * chosen race. They arrive as records rather than folded into `abilities`,
   * so a later race change swaps them cleanly and the sheet can explain why
   * CON is 16. See CONTEXT.md § Input vs derived.
   */
  modifiers?: Modifier[];
};

/**
 * The fields a caller may change. `id`, `schemaVersion` and `createdAt` are
 * not among them — an update never rewrites a character's identity.
 */
export type UpdateCharacterInput = Partial<Omit<CharacterRecord, "id" | "schemaVersion" | "createdAt" | "updatedAt">>;

const DEFAULT_ABILITY_SCORE = 10;

/**
 * Client-generated: there is no server to allocate ids. Non-sequential, so a
 * URL never leaks how many characters exist.
 */
export function newCharacterId(): string {
  return `c_${crypto.randomUUID()}`;
}

function emptyCharacterDefaults(now: Date): Omit<CharacterRecord, "id" | "name" | "level" | "classRef" | "raceRef"> {
  return {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    subclassRef: null,
    subraceRef: null,
    backgroundRef: null,
    alignment: null,
    abilities: Object.fromEntries(ABILITIES.map((abil) => [abil, DEFAULT_ABILITY_SCORE])) as Record<Abil, number>,
    hpRolls: [],
    proficiencies: { skills: [], expertise: [], saves: [], armor: [], weapons: [], tools: [], languages: [] },
    equipment: [],
    spells: { known: [], prepared: [] },
    modifiers: [],
    play: {
      currentHp: 0,
      tempHp: 0,
      hitDiceSpent: 0,
      deathSaves: { successes: 0, failures: 0 },
      slotsExpended: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
      // Ascending value: the sheet renders from `Object.entries`, so key order
      // here is display order.
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      conditions: [],
      inspiration: false,
      notes: "",
    },
  };
}

/**
 * The character's class features, narrowed to what the modifier map needs.
 *
 * Feature rows carry `name` as prose that may be absent on a malformed entry;
 * the index is the fallback, because a record labelled with its index still
 * says more than one labelled with nothing.
 */
async function featureSources(character: CharacterRecord, db: SheetcraftDb): Promise<FeatureSource[]> {
  const features = await loadClassFeatures(character, db);

  return features.map((entry) => ({
    index: entry.index,
    name: typeof entry.name === "string" ? entry.name : entry.index,
  }));
}

export async function createCharacter(
  input: CreateCharacterInput,
  db: SheetcraftDb = getDb(),
): Promise<CharacterRecord> {
  const now = new Date();
  const defaults = emptyCharacterDefaults(now);

  const record: CharacterRecord = {
    ...defaults,
    id: newCharacterId(),
    name: input.name,
    level: input.level,
    classRef: input.classRef,
    raceRef: input.raceRef,
    subclassRef: input.subclassRef ?? null,
    subraceRef: input.subraceRef ?? null,
    backgroundRef: input.backgroundRef ?? null,
    alignment: input.alignment ?? null,
    abilities: { ...defaults.abilities, ...input.abilities },
    hpRolls: input.hpRolls ?? [],
    modifiers: input.modifiers ?? [],
  };

  // The class features this character starts with, as records. Resolved here
  // rather than in the creation form because it is a catalog read and the form
  // is synchronous — and because every path that creates a character wants
  // them, not only the one with a form in front of it. See ADR-0004.
  //
  // Seeded disabled by `featureModifiers`, so nothing here changes a number
  // until the player flips it.
  record.modifiers = syncFeatureModifiers(record.modifiers, await featureSources(record, db));

  // The records authored ON the homebrew entries this character takes. A
  // catalog entry carries none, so this is a no-op for an all-SRD character
  // and nothing branches on where an entry came from. See ADR-0006.
  //
  // After the feature sync rather than before: the two write disjoint
  // namespaces (`feature:` and `homebrew:`) so the order does not change the
  // result, but running last means a homebrew subclass's records are present
  // when `derive()` computes starting HP below.
  record.modifiers = await syncAllEntryModifiers(record, db);

  // A new character starts at full health. Derived rather than summed here so
  // the CON modifier — including one arriving as a racial record — is counted
  // exactly once, by the one thing that knows how. `EMPTY_CONTEXT` is sound
  // for this: max HP reads neither armor nor spellcasting, and a character
  // being created has nothing equipped yet.
  record.play.currentHp = derive(record, EMPTY_CONTEXT).maxHp;

  await db.dnd_characters.add(record);
  return record;
}

export async function getCharacter(id: string, db: SheetcraftDb = getDb()): Promise<CharacterRecord | undefined> {
  return db.dnd_characters.get(id);
}

/**
 * Most recently touched first — the default sort on `/dnd`.
 *
 * Reversed in memory rather than with Dexie's `.reverse()`, which under
 * `cache: "immutable"` hands back new object identities for unchanged rows and
 * defeats downstream memoization (dexie/Dexie.js#2034). The index still does
 * the sorting; only the flip is ours, over the tens of characters a local
 * sheet app holds.
 */
export async function listCharacters(db: SheetcraftDb = getDb()): Promise<CharacterRecord[]> {
  const characters = await db.dnd_characters.orderBy("updatedAt").toArray();
  return characters.reverse();
}

/**
 * Applies a partial change and stamps `updatedAt`. Returns the stored record,
 * or `undefined` if no such character exists — a delete racing an edit is not
 * an exception.
 */
export async function updateCharacter(
  id: string,
  changes: UpdateCharacterInput,
  db: SheetcraftDb = getDb(),
): Promise<CharacterRecord | undefined> {
  return db.transaction("rw", db.dnd_characters, async () => {
    const existing = await db.dnd_characters.get(id);
    if (!existing) {
      return undefined;
    }

    const updated: CharacterRecord = { ...existing, ...changes, updatedAt: new Date() };
    await db.dnd_characters.put(updated);
    return updated;
  });
}

/**
 * The ref-bearing fields a loadout change writes — exactly the two CONTEXT.md
 * § Loadout names, and no more.
 *
 * `modifiers` is deliberately NOT here. A toggle is not a ref change: it needs
 * no re-sync, and routing it through this seam would re-derive every entry's
 * records to write a boolean. `useUpdateModifiers` already owns that write.
 * Widening this type to "fields the drawers might touch" would also cost the
 * one guarantee it exists to give — that everything through here has moved a
 * ref, so the sync it triggers is always warranted. See ADR-0007.
 */
export type LoadoutChanges = Partial<Pick<CharacterRecord, "equipment" | "spells">>;

/**
 * A loadout write: a patch, or a function of the stored record. See
 * `updateCharacterRefs`, which explains why the second form exists.
 */
export type LoadoutWrite = LoadoutChanges | ((current: CharacterRecord) => LoadoutChanges);

/**
 * Applies a change to the fields that carry refs, and **re-syncs the modifier
 * records the referenced homebrew entries author**.
 *
 * This exists rather than being a call to `updateCharacter` because the two
 * halves must not come apart. ADR-0006 recorded exactly this trap: an entry's
 * records are stored on the character rather than resolved on read, because
 * `enabled` is player state and a list rebuilt every read has nowhere to keep
 * it — so a homebrew item acquired after creation contributes nothing until
 * its entry is next saved, unless something brings the records forward. A
 * caller that had to remember a second call would eventually not.
 *
 * Both directions are covered by the one call, because `syncAllEntryModifiers`
 * is a merge over the character's *current* refs rather than an append: an
 * item dropped is an entry no longer walked, and `mergeModifiers` drops the
 * records it no longer produces. So acquiring applies and dropping removes,
 * with no separate removal path to keep in step.
 *
 * The sync and the write share **one transaction**, and the homebrew tables
 * are in its scope because the sync reads them. A sync that committed and a
 * write that then failed would leave a character carrying records for an item
 * it does not have.
 *
 * Takes either a patch or a **function of the stored record**. The function
 * form is what a surface with repeat taps wants: the drawers build a change
 * from the `character` prop, which is only replaced once a mutation settles
 * and its invalidation lands, so two quick taps on the quantity stepper both
 * compute from the same stale snapshot and a patch would silently discard the
 * first. The transaction has already read the current row, so handing it to
 * the caller costs nothing and closes the window. A patch stays accepted
 * because a single settled write is exactly that.
 *
 * Writes and restamps `updatedAt` **unconditionally**, which is deliberately
 * unlike `resyncCharacter` — that returns `null` when nothing moved, so an
 * entry edit touching only prose does not reorder the character list for a
 * change nobody can see. The asymmetry is sound because the two are asked
 * different questions: there, a re-sync may genuinely change nothing; here,
 * the caller has just changed what the character carries. A loadout change
 * that left `updatedAt` alone would be a change the character list could not
 * show.
 */
export async function updateCharacterRefs(
  id: string,
  changes: LoadoutWrite,
  db: SheetcraftDb = getDb(),
): Promise<CharacterRecord | undefined> {
  return db.transaction(
    "rw",
    [db.dnd_characters, ...HOMEBREW_TYPE_ORDER.map((type) => db.table(tableFor(type)))],
    async () => {
      const existing = await db.dnd_characters.get(id);
      if (!existing) {
        return undefined;
      }

      const patch = typeof changes === "function" ? changes(existing) : changes;
      const changed: CharacterRecord = { ...existing, ...patch };

      // Against the CHANGED record, not the stored one: the refs the sync walks
      // are the ones this write is about to make true.
      const updated: CharacterRecord = {
        ...changed,
        modifiers: await syncAllEntryModifiers(changed, db),
        updatedAt: new Date(),
      };

      await db.dnd_characters.put(updated);
      return updated;
    },
  );
}

/** Idempotent: deleting an id that is already gone is not an error. */
export async function deleteCharacter(id: string, db: SheetcraftDb = getDb()): Promise<void> {
  await db.dnd_characters.delete(id);
}
