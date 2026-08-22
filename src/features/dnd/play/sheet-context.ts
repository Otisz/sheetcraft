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
import { resolveRef } from "@/features/dnd/db/resolve-ref";
import { ABILITIES, type Abil, type CatalogEntry, type CharacterRecord, type Ref } from "@/features/dnd/db/schema";
import type { DeriveContext, EquippedArmor, Skill } from "@/features/dnd/derive";
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
  const [armor, spellcastingAbility, speed, skillProficiencies, expertise] = await Promise.all([
    loadArmor(character, db),
    loadSpellcastingAbility(character, db),
    loadSpeed(character, db),
    loadSkills(character.proficiencies.skills, db),
    loadSkills(character.proficiencies.expertise, db),
  ]);

  return { armor, spellcastingAbility, speed, skillProficiencies, expertise };
}
