/**
 * Hand-authored characters whose expected values are transcribed from the 2014
 * rulebook, never computed by the engine under test. A fixture reverse-engineered
 * from the code proves only that the code is self-consistent. See ADR-0002 § Fixtures.
 *
 * Typed literals rather than JSON so a schema change breaks compilation.
 */
import type { Abil, CharacterRecord, Modifier } from "@/features/dnd/db/schema";
import type { EquippedArmor } from "@/features/dnd/derive/context";

/** A character with every field at a neutral value, for tests to spread over. */
export function makeCharacter(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: "test",
    schemaVersion: 1,
    name: "Test",
    createdAt: new Date(0),
    updatedAt: new Date(0),

    level: 1,
    classRef: "catalog:fighter",
    subclassRef: null,
    raceRef: "catalog:human",
    subraceRef: null,
    backgroundRef: null,
    alignment: null,

    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    hpRolls: [10],
    proficiencies: { skills: [], expertise: [], saves: [], armor: [], weapons: [], tools: [], languages: [] },
    equipment: [],
    spells: { known: [], prepared: [] },
    modifiers: [],

    play: {
      currentHp: 10,
      tempHp: 0,
      hitDiceSpent: 0,
      deathSaves: { successes: 0, failures: 0 },
      slotsExpended: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      conditions: [],
      inspiration: false,
      notes: "",
    },
    ...overrides,
  };
}

/** A modifier with sensible defaults, for tests to spread over. */
export function makeModifier(overrides: Partial<Modifier> & Pick<Modifier, "target">): Modifier {
  return {
    id: `mod-${overrides.target}-${overrides.op ?? "add"}-${String(overrides.value ?? 0)}`,
    source: "test",
    op: "add",
    value: 0,
    enabled: true,
    label: "Test modifier",
    ...overrides,
  };
}

/** Ability scores as a partial patch over the neutral 10s. */
export function abilities(patch: Partial<Record<Abil, number>>): Record<Abil, number> {
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...patch };
}

/** An equipped armor entry, defaulting to a plain body armor. */
export function makeArmor(overrides: Partial<EquippedArmor> & Pick<EquippedArmor, "index">): EquippedArmor {
  return {
    name: overrides.index,
    base: 10,
    dexBonus: false,
    isShield: false,
    ...overrides,
  };
}

/**
 * The SRD armor entries the AC cases use, transcribed from the vendored
 * `equipment.json` rather than invented — `max_bonus` is absent on light armor
 * there, and it is absent here.
 */
export const ARMOR = {
  leather: makeArmor({ index: "leather-armor", name: "Leather Armor", base: 11, dexBonus: true }),
  scaleMail: makeArmor({ index: "scale-mail", name: "Scale Mail", base: 14, dexBonus: true, maxBonus: 2 }),
  chainMail: makeArmor({ index: "chain-mail", name: "Chain Mail", base: 16, dexBonus: false }),
  shield: makeArmor({ index: "shield", name: "Shield", base: 2, dexBonus: false, isShield: true }),
} as const;
