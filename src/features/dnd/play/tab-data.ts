/**
 * The catalog data the six tabs need but the derivation engine does not: the
 * display name behind every ref they show, and the class and race feature prose
 * the Features tab expands.
 *
 * Kept apart from `sheet-context.ts` on purpose. That module resolves what
 * *derivation* needs and sits on the path to first paint; this one resolves
 * what *display* needs and can arrive a moment later. Merging them would put a
 * 300-row feature scan in front of the HP row.
 *
 * Every miss degrades rather than throws, exactly as the rest of the sheet
 * does: a ref can dangle after an upstream re-seed, and that is not the
 * player's doing.
 */

import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import { type RefType, refIndex, resolveRef } from "@/features/dnd/db/resolve-ref";
import type { CharacterRecord, Ref } from "@/features/dnd/db/schema";
import { titleCase } from "@/features/dnd/play/format";

/** One class or race feature, as the Features tab renders it. */
export type FeatureEntry = {
  index: string;
  name: string;
  /** The SRD's own paragraphs. Prose only — a feature that changes a number does it through a modifier record. */
  description: string[];
  /** The level it was gained at. Absent for a race trait, which has no level. */
  level?: number;
};

/** Everything the tabs display that is not derived. */
export type TabData = {
  /**
   * Display name by ref. A ref that is absent here did not resolve, and the
   * caller renders it as `⚠ unknown (<index>)` rather than as a blank.
   */
  names: Partial<Record<string, string>>;
  classFeatures: FeatureEntry[];
  raceFeatures: FeatureEntry[];
};

/** The SRD stores prose as an array of paragraphs; anything else is no prose. */
function toDescription(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((line): line is string => typeof line === "string") : [];
}

/**
 * Resolves a batch of refs to display names, dropping the misses.
 *
 * Grouped by ref type because a `catalog:longsword` and a `catalog:magic-missile`
 * live in different tables, and only the caller knows which is which.
 */
async function loadNames(
  requests: { type: RefType; refs: (Ref | null)[] }[],
  db: SheetcraftDb,
): Promise<Record<string, string>> {
  const resolved = await Promise.all(
    requests.flatMap(({ type, refs }) =>
      refs
        .filter((ref): ref is Ref => ref !== null)
        .map(async (ref) => {
          const resolution = await resolveRef(type, ref, db);
          const name = resolution.found ? resolution.entry.name : undefined;
          return typeof name === "string" ? ([ref, name] as const) : null;
        }),
    ),
  );

  return Object.fromEntries(resolved.filter((entry): entry is [Ref, string] => entry !== null));
}

/**
 * The class features this character has unlocked, in level order.
 *
 * Scoped three ways, and each exclusion matters:
 *
 * - **By class**, so a rogue's Sneak Attack never appears on a barbarian.
 * - **By level**, so a level 3 character is not shown level 9 prose as though
 *   they had it.
 * - **By subclass**, so a Berserker sees Frenzy and a Totem Warrior does not.
 *   A feature carrying *no* subclass belongs to the base class and is always
 *   included; one carrying a different subclass is dropped.
 */
async function loadClassFeatures(character: CharacterRecord, db: SheetcraftDb): Promise<FeatureEntry[]> {
  const classIndex = refIndex(character.classRef);
  if (!classIndex) {
    return [];
  }

  const subclassIndex = refIndex(character.subclassRef);

  const rows = await db.dnd_catalog_features.filter((entry) => {
    const owner = (entry.class as { index?: unknown } | undefined)?.index;
    if (owner !== classIndex) {
      return false;
    }

    const level = entry.level;
    if (typeof level !== "number" || level > character.level) {
      return false;
    }

    const subclass = (entry.subclass as { index?: unknown } | undefined)?.index;
    return subclass === undefined || subclass === subclassIndex;
  });

  const features = await rows.toArray();

  return features
    .map((entry) => ({
      index: entry.index,
      name: typeof entry.name === "string" ? entry.name : entry.index,
      description: toDescription(entry.desc),
      level: entry.level as number,
    }))
    .sort((a, b) => a.level - b.level);
}

/**
 * The race's traits.
 *
 * Upstream stores the relationship on the *trait* — each carries the races and
 * subraces it belongs to — so this scans traits rather than reading a list off
 * the race, which is the shape the data actually has.
 */
async function loadRaceFeatures(character: CharacterRecord, db: SheetcraftDb): Promise<FeatureEntry[]> {
  const raceIndex = refIndex(character.raceRef);
  const subraceIndex = refIndex(character.subraceRef);
  if (!raceIndex) {
    return [];
  }

  const rows = await db.dnd_catalog_traits.filter((entry) => {
    const races = (entry.races as { index?: unknown }[] | undefined) ?? [];
    const subraces = (entry.subraces as { index?: unknown }[] | undefined) ?? [];

    return (
      races.some((race) => race.index === raceIndex) ||
      (subraceIndex !== null && subraces.some((subrace) => subrace.index === subraceIndex))
    );
  });

  const traits = await rows.toArray();

  return traits.map((entry) => ({
    index: entry.index,
    name: typeof entry.name === "string" ? entry.name : entry.index,
    description: toDescription(entry.desc),
  }));
}

/**
 * Names for the character's languages.
 *
 * **Languages are not a catalog type.** The upstream pin has no `languages`
 * file and the database has no table for one — each race carries its languages
 * inline instead. So a `catalog:common` language ref has nothing to resolve
 * against, and routing it through `proficiencies` like the other four kinds
 * would miss every single time, painting the Bio tab with ⚠ markers for
 * languages the character genuinely has.
 *
 * The race's own list is read first. Anything it does not cover — a language
 * from a background, or one chosen freely — falls back to the index made
 * readable, because `Elvish` is a better answer than `⚠ unknown (elvish)` for a
 * ref that is not actually broken.
 */
async function loadLanguageNames(character: CharacterRecord, db: SheetcraftDb): Promise<Record<string, string>> {
  const declared = new Map<string, string>();

  for (const [type, ref] of [
    ["races", character.raceRef],
    ["subraces", character.subraceRef],
  ] as const) {
    if (ref === null) {
      continue;
    }

    const resolution = await resolveRef(type, ref, db);
    if (!resolution.found) {
      continue;
    }

    const languages = (resolution.entry.languages as { index?: unknown; name?: unknown }[] | undefined) ?? [];
    for (const language of languages) {
      if (typeof language.index === "string" && typeof language.name === "string") {
        declared.set(language.index, language.name);
      }
    }
  }

  return Object.fromEntries(
    character.proficiencies.languages.flatMap((ref) => {
      const index = refIndex(ref);
      return index ? [[ref, declared.get(index) ?? titleCase(index)] as const] : [];
    }),
  );
}

/** Everything the tabs need, in one pass. Every lookup runs concurrently. */
export async function loadTabData(character: CharacterRecord, db: SheetcraftDb = getDb()): Promise<TabData> {
  const { proficiencies } = character;

  const [names, languageNames, classFeatures, raceFeatures] = await Promise.all([
    loadNames(
      [
        { type: "classes", refs: [character.classRef] },
        { type: "subclasses", refs: [character.subclassRef] },
        { type: "races", refs: [character.raceRef] },
        { type: "subraces", refs: [character.subraceRef] },
        { type: "backgrounds", refs: [character.backgroundRef] },
        { type: "equipment", refs: character.equipment.map((entry) => entry.itemRef) },
        { type: "spells", refs: [...character.spells.known, ...character.spells.prepared] },
        { type: "skills", refs: [...proficiencies.skills, ...proficiencies.expertise] },
        // Languages are absent here on purpose — see `loadLanguageNames`.
        {
          type: "proficiencies",
          refs: [...proficiencies.armor, ...proficiencies.weapons, ...proficiencies.tools],
        },
      ],
      db,
    ),
    loadLanguageNames(character, db),
    loadClassFeatures(character, db),
    loadRaceFeatures(character, db),
  ]);

  return { names: { ...names, ...languageNames }, classFeatures, raceFeatures };
}
