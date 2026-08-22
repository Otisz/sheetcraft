import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import type { Abil, CharacterRecord, Modifier, Ref } from "@/features/dnd/db/schema";
import { ABILITIES } from "@/features/dnd/db/schema";
import { derive, EMPTY_CONTEXT } from "@/features/dnd/derive";

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

/** Idempotent: deleting an id that is already gone is not an error. */
export async function deleteCharacter(id: string, db: SheetcraftDb = getDb()): Promise<void> {
  await db.dnd_characters.delete(id);
}
