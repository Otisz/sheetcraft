/**
 * Resolving a `DeriveContext` for a stored character.
 *
 * The engine is pure and cannot reach Dexie, so somebody has to turn the
 * character's refs into the structural catalog data AC, speed and spellcasting
 * need. This is that somebody — the one place the sheet crosses from stored
 * refs to resolved entries, and it goes through `resolveRef` so the ref grammar
 * stays in the single place CONTEXT.md puts it.
 *
 * Every miss degrades rather than throws: a catalog ref can dangle after an
 * upstream re-seed, and that is not the player's doing. Derived values fall
 * back to base, which is what the rest of the app already does with an
 * unresolvable ref.
 */

import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import { refIndex, resolveRef } from "@/features/dnd/db/resolve-ref";
import {
  ABILITIES,
  type Abil,
  type CatalogEntry,
  type CharacterRecord,
  type Ref,
  type SpellSlotLevel,
} from "@/features/dnd/db/schema";
import type { DeriveContext, EquippedArmor, Skill, SlotsByLevel, Weapon } from "@/features/dnd/derive";
import { DEFAULT_SPEED, SKILLS } from "@/features/dnd/derive";

/** The SRD's own category string for a shield. Every other value is body armor. */
const SHIELD_CATEGORY = "Shield";

/** One equipment entry's armor block, exactly as the SRD stores it. */
type ArmorClassRow = {
  base?: unknown;
  dex_bonus?: unknown;
  max_bonus?: unknown;
};

/**
 * Narrows a catalog row to armor, or `null` if it is not armor at all.
 *
 * `max_bonus` is copied only when it is actually present: the SRD **omits the
 * key** on unlimited-dex light armor, and the engine reads absent as uncapped.
 * Writing `maxBonus: undefined` unconditionally would be equivalent, but
 * spelling it out is what stops a later edit "tidying" it to 0 and costing a
 * DEX 18 rogue four points of AC.
 */
function toEquippedArmor(entry: CatalogEntry): EquippedArmor | null {
  const armorClass = entry.armor_class as ArmorClassRow | undefined;
  if (!armorClass || typeof armorClass.base !== "number") {
    return null;
  }

  const armor: EquippedArmor = {
    index: entry.index,
    name: typeof entry.name === "string" ? entry.name : entry.index,
    base: armorClass.base,
    dexBonus: armorClass.dex_bonus === true,
    // Read from the category rather than matched against the name: the engine
    // must never string-match catalog prose, and a homebrew shield named
    // "Aegis" is still a shield.
    isShield: entry.armor_category === SHIELD_CATEGORY,
  };

  if (typeof armorClass.max_bonus === "number") {
    armor.maxBonus = armorClass.max_bonus;
  }

  return armor;
}

/** Every equipped armor entry, shields included, in the order they are carried. */
async function loadArmor(character: CharacterRecord, db: SheetcraftDb): Promise<EquippedArmor[]> {
  const equipped = character.equipment.filter((entry) => entry.equipped);

  const resolved = await Promise.all(
    equipped.map(async (entry) => {
      const resolution = await resolveRef("equipment", entry.itemRef, db);
      return resolution.found ? toEquippedArmor(resolution.entry) : null;
    }),
  );

  return resolved.filter((armor): armor is EquippedArmor => armor !== null);
}

/** The SRD's own category index for a weapon. Everything else is gear. */
const WEAPON_CATEGORY = "weapon";

/** The SRD's own `weapon_range` value for a ranged weapon. */
const RANGED = "Ranged";

/** The SRD's own property index for finesse. PHB p.195. */
const FINESSE = "finesse";

/** One equipment entry's weapon block, exactly as the SRD stores it. */
type WeaponRow = {
  equipment_category?: { index?: unknown };
  weapon_range?: unknown;
  damage?: { damage_dice?: unknown; damage_type?: { name?: unknown } };
  properties?: { index?: unknown }[];
};

/**
 * Narrows a catalog row to a weapon, or `null` if it is not one.
 *
 * Every read is from a *structural* field — the category index, the range
 * string, the properties array — never from the name, for the same reason
 * armor reads `armor_category`: a homebrew dagger called "Fang" is still a
 * finesse weapon, and a longsword called "Dagger of Kings" is not.
 *
 * `proficient` is decided by the caller, which is the only party that knows the
 * character's proficiency list.
 */
function toWeapon(entry: CatalogEntry, proficient: boolean): Weapon | null {
  const row = entry as WeaponRow;
  if (row.equipment_category?.index !== WEAPON_CATEGORY) {
    return null;
  }

  const damageDice = row.damage?.damage_dice;
  const damageType = row.damage?.damage_type?.name;

  return {
    index: entry.index,
    name: typeof entry.name === "string" ? entry.name : entry.index,
    // A weapon with no damage block is not an error — the SRD's net has none.
    // An empty string renders as a bare modifier, which is what it is.
    damageDice: typeof damageDice === "string" ? damageDice : "",
    damageType: typeof damageType === "string" ? damageType : "",
    finesse: (row.properties ?? []).some((property) => property.index === FINESSE),
    ranged: row.weapon_range === RANGED,
    proficient,
  };
}

/**
 * The weapon indices the character is proficient with, expanded from the
 * proficiency refs they store.
 *
 * The upstream shape is the whole difficulty here, and it is not the obvious
 * one. A proficiency row carries a **singular `reference`**, which points at
 * one of two different tables depending on what kind of proficiency it is:
 *
 * - a *category* (`martial-weapons`) references an **equipment category**,
 *   whose `equipment` array is the only place upstream lists the 23 weapons it
 *   covers;
 * - a *named* proficiency (`longswords`) references the **equipment** entry
 *   directly.
 *
 * Which table is settled by the reference's own `url`, not guessed at. The
 * plural `references` array a reasonable person would reach for is present on
 * every row and **empty on all 117** — reading it matches nothing, and does so
 * silently, which costs a proficient barbarian their +2 to hit.
 *
 * Expanding through the catalog rather than hardcoding a category table is what
 * keeps this correct across a re-pin: the weapon list moves upstream, not here.
 */
async function loadWeaponProficiencies(character: CharacterRecord, db: SheetcraftDb): Promise<Set<string>> {
  const resolved = await Promise.all(
    character.proficiencies.weapons.map(async (ref) => {
      const resolution = await resolveRef("proficiencies", ref, db);
      if (!resolution.found) {
        return [];
      }

      const reference = resolution.entry.reference as { index?: unknown; url?: unknown } | undefined;
      if (typeof reference?.index !== "string") {
        return [];
      }

      if (typeof reference.url === "string" && reference.url.includes(EQUIPMENT_CATEGORY_PATH)) {
        const category = await db.dnd_catalog_equipment_categories.get(reference.index);
        const equipment = (category?.equipment as { index?: unknown }[] | undefined) ?? [];
        return equipment.map((entry) => entry.index).filter((index) => typeof index === "string");
      }

      // Not a category, so the reference names one weapon outright.
      return [reference.index];
    }),
  );

  return new Set(resolved.flat());
}

/** The URL segment that marks a proficiency's reference as an equipment category. */
const EQUIPMENT_CATEGORY_PATH = "/equipment-categories/";

/**
 * Every weapon the character carries, equipped or not.
 *
 * Unlike armor this deliberately ignores `equipped`: a sheathed sword is still
 * something you can attack with, and hiding it until the player toggles a flag
 * would make the Combat tab lie about what is in their hands.
 */
async function loadWeapons(character: CharacterRecord, db: SheetcraftDb): Promise<Weapon[]> {
  const proficientWith = await loadWeaponProficiencies(character, db);

  const resolved = await Promise.all(
    character.equipment.map(async (entry) => {
      const resolution = await resolveRef("equipment", entry.itemRef, db);
      return resolution.found ? toWeapon(resolution.entry, proficientWith.has(resolution.index)) : null;
    }),
  );

  return resolved.filter((weapon): weapon is Weapon => weapon !== null);
}

/** The class's hit die, or `undefined` when the ref dangles so the engine falls back. */
async function loadHitDie(character: CharacterRecord, db: SheetcraftDb): Promise<number | undefined> {
  const resolution = await resolveRef("classes", character.classRef, db);
  if (!resolution.found || typeof resolution.entry.hit_die !== "number") {
    return undefined;
  }

  return resolution.entry.hit_die;
}

/** One level row's spellcasting block, exactly as the SRD stores it. */
type SpellcastingRow = {
  cantrips_known?: unknown;
  [key: string]: unknown;
};

/** What the level row contributes: the slot maxima and the cantrip count. */
type LevelSpellcasting = {
  slotsByLevel?: SlotsByLevel;
  cantripsKnown: number;
};

/**
 * The slot table for this character's class and level.
 *
 * The level row's `index` is `<class>-<level>`, which is the compound key
 * upstream uses and therefore the one looked up here — a `[class+level]` index
 * exists on the table, but the id is exact and a `get` beats a range query.
 *
 * Zero-valued levels are dropped rather than carried: the SRD stores explicit
 * zeroes for every level a caster has no slots in, and a row reading "0 / 0" is
 * noise on a phone. `slotsByLevel` is left absent when nothing survives, which
 * is how a non-caster and a caster with no slots yet come out the same.
 */
async function loadLevelSpellcasting(character: CharacterRecord, db: SheetcraftDb): Promise<LevelSpellcasting> {
  const classIndex = refIndex(character.classRef);
  if (!classIndex) {
    return { cantripsKnown: 0 };
  }

  const row = (await db.dnd_catalog_levels.get(`${classIndex}-${character.level}`)) as
    | { spellcasting?: SpellcastingRow }
    | undefined;
  const spellcasting = row?.spellcasting;
  if (!spellcasting) {
    return { cantripsKnown: 0 };
  }

  const slotsByLevel: SlotsByLevel = {};
  for (const slotLevel of SPELL_SLOT_LEVELS) {
    const count = spellcasting[`spell_slots_level_${slotLevel}`];
    if (typeof count === "number" && count > 0) {
      slotsByLevel[slotLevel] = count;
    }
  }

  const cantripsKnown = spellcasting.cantrips_known;

  return {
    ...(Object.keys(slotsByLevel).length > 0 ? { slotsByLevel } : {}),
    cantripsKnown: typeof cantripsKnown === "number" ? cantripsKnown : 0,
  };
}

/** The nine slot levels, ascending. */
const SPELL_SLOT_LEVELS: SpellSlotLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function isAbil(value: unknown): value is Abil {
  return typeof value === "string" && (ABILITIES as readonly string[]).includes(value);
}

/**
 * The class's spellcasting ability, or `null` for a non-caster.
 *
 * `null` is also what an unresolvable class ref produces. Both mean "no DC to
 * show", and the sheet renders that as an absence rather than as a number it
 * cannot justify. See CONTEXT.md § Base formula.
 */
async function loadSpellcastingAbility(character: CharacterRecord, db: SheetcraftDb): Promise<Abil | null> {
  const resolution = await resolveRef("classes", character.classRef, db);
  if (!resolution.found) {
    return null;
  }

  const spellcasting = resolution.entry.spellcasting as { spellcasting_ability?: { index?: unknown } } | undefined;
  const ability = spellcasting?.spellcasting_ability?.index;

  return isAbil(ability) ? ability : null;
}

/** The race's base walking speed, falling back when the ref dangles. */
async function loadSpeed(character: CharacterRecord, db: SheetcraftDb): Promise<number> {
  const resolution = await resolveRef("races", character.raceRef, db);
  if (!resolution.found || typeof resolution.entry.speed !== "number") {
    return DEFAULT_SPEED;
  }

  return resolution.entry.speed;
}

function isSkill(value: string): value is Skill {
  return Object.hasOwn(SKILLS, value);
}

/**
 * Turns stored skill refs into the `Skill` keys the engine understands.
 *
 * The refs are resolved through `resolveRef` rather than string-matched, so a
 * ref whose entry is gone is dropped rather than silently trusted — and a ref
 * naming something outside the engine's 18 skills is dropped too, because a
 * proficiency the engine cannot apply is not a proficiency it should claim.
 */
async function loadSkills(refs: Ref[], db: SheetcraftDb): Promise<Skill[]> {
  const resolved = await Promise.all(
    refs.map(async (ref) => {
      const resolution = await resolveRef("skills", ref, db);
      return resolution.found && isSkill(resolution.index) ? resolution.index : null;
    }),
  );

  return resolved.filter((skill): skill is Skill => skill !== null);
}

/**
 * The whole context, in one pass. Every lookup runs concurrently — the sheet
 * derives on every read, so this is on the path to first paint.
 */
export async function loadDeriveContext(
  character: CharacterRecord,
  db: SheetcraftDb = getDb(),
): Promise<DeriveContext> {
  const [armor, spellcastingAbility, speed, skillProficiencies, expertise, hitDie, weapons, levelSpellcasting] =
    await Promise.all([
      loadArmor(character, db),
      loadSpellcastingAbility(character, db),
      loadSpeed(character, db),
      loadSkills(character.proficiencies.skills, db),
      loadSkills(character.proficiencies.expertise, db),
      loadHitDie(character, db),
      loadWeapons(character, db),
      loadLevelSpellcasting(character, db),
    ]);

  return {
    armor,
    spellcastingAbility,
    speed,
    skillProficiencies,
    expertise,
    weapons,
    cantripsKnown: levelSpellcasting.cantripsKnown,
    // Both spread rather than assigned: absent is the signal the engine falls
    // back on, and writing `hitDie: undefined` would be equivalent today but is
    // exactly what a later `?? 0` tidy-up turns into a wrong number.
    ...(hitDie === undefined ? {} : { hitDie }),
    ...(levelSpellcasting.slotsByLevel ? { slotsByLevel: levelSpellcasting.slotsByLevel } : {}),
  };
}
