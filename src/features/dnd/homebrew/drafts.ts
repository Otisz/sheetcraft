import { refIndex } from "@/features/dnd/db/resolve-ref";
import type { Abil, Ref } from "@/features/dnd/db/schema";
import { ABILITIES } from "@/features/dnd/db/schema";
import type { HomebrewType } from "@/features/dnd/homebrew/types";

/**
 * What the forms hold, and how it becomes a schema-valid entry.
 *
 * The draft is **all strings and booleans**, because that is what a text input
 * produces. Coercion happens once, here, on the way out — a form that stored
 * numbers would have to decide what a half-typed `-` means on every keystroke.
 *
 * Every field the vendored schema requires is either asked for or supplied
 * with a defensible default; nothing optional is invented. `drafts.test.ts`
 * holds each type to the contract by running the built candidate through the
 * real schema.
 */

/**
 * One draft shape for every form type rather than a union. The forms render
 * disjoint subsets of it, and a union would need a discriminant threaded
 * through every field component for no gain — the builder is the only thing
 * that reads more than one field at a time, and it already switches on type.
 */
export type FormDraft = {
  name: string;
  /** Parent race (subrace) or parent class (subclass), as the picker's ref. */
  parentRef: Ref | null;
  /**
   * The parent's display name. Carried alongside the ref because the schema
   * stores a full `APIReference` and the ref holds only an index — without it,
   * loading `Barbarian` and saving it again would write back `barbarian`.
   */
  parentName: string;
  /** Prose. Split into the schema's array of lines on build. */
  desc: string;

  // races
  speed: string;
  size: string;
  sizeDescription: string;
  alignment: string;
  age: string;
  /** Comma-separated. */
  languages: string;
  languageDesc: string;

  // races, subraces
  abilityBonuses: Record<Abil, string>;

  // equipment
  category: string;
  costQuantity: string;
  costUnit: string;
  weight: string;

  // spells
  level: string;
  range: string;
  /** Comma-separated — `V, S, M`. */
  components: string;
  duration: string;
  castingTime: string;
  school: string;
  ritual: boolean;
  concentration: boolean;
  /**
   * Which classes get the spell, by display name — the schema stores a full
   * `APIReference`, and a spell's class list is prose the sheet renders rather
   * than a ref anything resolves.
   */
  classNames: string[];
};

/**
 * A blank draft.
 *
 * The same one for every type — the draft is a union of all the forms' fields
 * and each form reads only its own, so there is nothing type-specific to
 * decide here. Taking a type it never read would imply otherwise.
 *
 * Nothing is pre-filled: a form that opens with `30` in the speed field is a
 * form that ships that 30 for every race nobody looked at. The one exception
 * is the cost unit, which is `gp` for practically every entry and is a chore
 * rather than a choice.
 */
export function emptyFormDraft(): FormDraft {
  return {
    name: "",
    parentRef: null,
    parentName: "",
    desc: "",
    speed: "",
    size: "",
    sizeDescription: "",
    alignment: "",
    age: "",
    languages: "",
    languageDesc: "",
    abilityBonuses: Object.fromEntries(ABILITIES.map((abil) => [abil, ""])) as Record<Abil, string>,
    category: "",
    costQuantity: "",
    costUnit: "gp",
    weight: "",
    level: "",
    range: "",
    components: "",
    duration: "",
    castingTime: "",
    school: "",
    ritual: false,
    concentration: false,
    classNames: [],
  };
}

/** A typed number, or 0. A half-typed field must not build `NaN`. */
function num(text: string): number {
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A typed number, or `undefined` — for optional fields, where 0 is a claim. */
function optionalNum(text: string): number | undefined {
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Prose as the schema's array of lines. Blank lines are spacing, not content. */
function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** A comma-separated field as a trimmed list. */
function commaList(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/**
 * A name as the `APIReference` the schemas want. The `url` is synthesised
 * rather than left blank: the schema requires it, nothing in Sheetcraft
 * dereferences it, and a made-up path that says where the thing WOULD live is
 * more honest than an empty string that looks like a missing value.
 */
function reference(collection: string, name: string) {
  const index = slugPart(name);
  return { index, name, url: `/api/${collection}/${index}` };
}

/**
 * An entry the picker already named. The index comes off the ref — upstream
 * stores a parent WITHOUT a prefix — and the name from the draft, which is the
 * only thing that knows it.
 */
function referenceFromRef(collection: string, ref: Ref | null, name: string) {
  const index = refIndex(ref) ?? "";
  return { index, name: name === "" ? index : name, url: `/api/${collection}/${index}` };
}

/**
 * The ability bonus rows as the schema's array. A blank or zero row is one the
 * author did not touch — `+0` is not a racial bonus, it is the absence of one,
 * and storing it would put a no-op step in the sheet's "why is my CON 16?"
 * trace.
 */
function abilityBonuses(draft: FormDraft) {
  return ABILITIES.flatMap((abil) => {
    const bonus = optionalNum(draft.abilityBonuses[abil]);
    if (bonus === undefined || bonus === 0) {
      return [];
    }
    return [
      {
        ability_score: { index: abil, name: abil.toUpperCase(), url: `/api/ability-scores/${abil}` },
        bonus,
      },
    ];
  });
}

/** The stored entry, minus the `index` the repository assigns. */
export type Candidate = Record<string, unknown>;

/**
 * A draft as the candidate the repository validates.
 *
 * `index` is deliberately absent: it is a slug of the name, scoped and
 * de-duplicated against the table, and only the repository can see the table.
 */
export function buildCandidate(type: HomebrewType, draft: FormDraft): Candidate {
  const name = draft.name.trim();

  switch (type) {
    case "races":
      return {
        name,
        speed: num(draft.speed),
        ability_bonuses: abilityBonuses(draft),
        alignment: draft.alignment.trim(),
        age: draft.age.trim(),
        size: draft.size.trim(),
        size_description: draft.sizeDescription.trim(),
        languages: commaList(draft.languages).map((language) => reference("languages", language)),
        language_desc: draft.languageDesc.trim(),
        url: `/api/races/${slugPart(name)}`,
      };

    case "subraces":
      return {
        name,
        race: referenceFromRef("races", draft.parentRef, draft.parentName),
        desc: draft.desc.trim(),
        ability_bonuses: abilityBonuses(draft),
        url: `/api/subraces/${slugPart(name)}`,
      };

    case "equipment":
      return {
        name,
        equipment_category: reference("equipment-categories", draft.category.trim() || "Adventuring Gear"),
        cost: { quantity: num(draft.costQuantity), unit: draft.costUnit.trim() || "gp" },
        ...optional("weight", optionalNum(draft.weight)),
        ...optional("desc", nonEmpty(lines(draft.desc))),
        url: `/api/equipment/${slugPart(name)}`,
      };

    case "spells":
      return {
        name,
        desc: lines(draft.desc),
        range: draft.range.trim(),
        components: commaList(draft.components),
        ritual: draft.ritual,
        duration: draft.duration.trim(),
        concentration: draft.concentration,
        casting_time: draft.castingTime.trim(),
        level: num(draft.level),
        school: reference("magic-schools", draft.school.trim() || "Evocation"),
        classes: draft.classNames.map((one) => reference("classes", one)),
        url: `/api/spells/${slugPart(name)}`,
      };

    case "subclasses":
      return {
        name,
        class: referenceFromRef("classes", draft.parentRef, draft.parentName),
        // The minimal form does not ask for flavor text; upstream's is the
        // subclass's collective noun ("Martial Archetype"), and a blank string
        // is schema-valid and visibly absent rather than invented.
        subclass_flavor: "",
        // Level features, as prose. They land in the field the sheet already
        // renders rather than in a structured field the schema does not have.
        desc: lines(draft.desc),
        subclass_levels: `/api/subclasses/${slugPart(name)}/levels`,
        url: `/api/subclasses/${slugPart(name)}`,
      };

    // `classes` and `backgrounds` are JSON-only: 190 and 168 leaves, and a
    // phone form for either is not buildable. See CONTEXT.md § Homebrew
    // authoring tiers.
    //
    // Throwing rather than returning a `{ name }` that no schema accepts: a
    // half-built candidate would travel to the repository and come back as a
    // pile of "required" issues pointing at fields the user was never shown,
    // which reads as the form being broken rather than absent.
    case "classes":
    case "backgrounds":
      throw new Error(`${type} has no form — it is authored as JSON.`);
  }
}

/** A key/value pair, or nothing — so an unset optional field is absent, not `undefined`. */
function optional<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}

function nonEmpty<T>(list: T[]): T[] | undefined {
  return list.length === 0 ? undefined : list;
}

/**
 * The name as it appears inside a synthesised `url`. Not `slugify` from
 * `slug.ts`: that one assigns IDENTITY and its apostrophe rule exists to match
 * upstream's ids, whereas this is cosmetic path text. Keeping them apart means
 * a change to one cannot silently re-key stored entries.
 */
function slugPart(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A stored entry, as the loose shape a reader has to treat it as. */
type StoredEntry = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numText(value: unknown): string {
  return typeof value === "number" ? String(value) : "";
}

function bool(value: unknown): boolean {
  return value === true;
}

/** An array of `{name}` references as the comma-separated field that produced it. */
function namesOf(value: unknown): string {
  return Array.isArray(value) ? value.map((one) => str((one as StoredEntry)?.name)).join(", ") : "";
}

/** An array of prose lines as the textarea that produced it. */
function proseOf(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((line) => str(line)).join("\n");
  }
  return str(value);
}

/** The `ability_bonuses` array back as the six per-ability fields. */
function bonusFields(value: unknown): Record<Abil, string> {
  const fields = Object.fromEntries(ABILITIES.map((abil) => [abil, ""])) as Record<Abil, string>;
  if (!Array.isArray(value)) {
    return fields;
  }

  for (const row of value) {
    const abil = str((row as StoredEntry)?.ability_score && ((row as StoredEntry).ability_score as StoredEntry).index);
    if ((ABILITIES as readonly string[]).includes(abil)) {
      fields[abil as Abil] = numText((row as StoredEntry).bonus);
    }
  }

  return fields;
}

/**
 * A bare upstream index as the prefixed ref the pickers speak.
 *
 * `source` is the caller's knowledge, not the entry's: upstream stores a
 * parent WITHOUT a prefix, so the string alone genuinely cannot say which
 * table it addresses. It defaults to `catalog`, which is where all but a
 * handful of parents live, and the picker shows the mistake immediately when
 * it is wrong.
 */
function refFromIndex(index: unknown, source: "catalog" | "homebrew"): Ref | null {
  const bare = str(index);
  return bare === "" ? null : (`${source}:${bare}` as Ref);
}

/**
 * A stored entry back into the draft that would produce it.
 *
 * The inverse of `buildCandidate`, and held to that by a round-trip test: an
 * entry opened for editing and saved untouched must come out byte-identical,
 * or merely looking at an entry rewrites it.
 */
export function draftFromEntry(
  type: HomebrewType,
  entry: StoredEntry,
  parentSource: "catalog" | "homebrew" = "catalog",
): FormDraft {
  const draft = emptyFormDraft();
  draft.name = str(entry.name);

  switch (type) {
    case "races":
      return {
        ...draft,
        speed: numText(entry.speed),
        abilityBonuses: bonusFields(entry.ability_bonuses),
        alignment: str(entry.alignment),
        age: str(entry.age),
        size: str(entry.size),
        sizeDescription: str(entry.size_description),
        languages: namesOf(entry.languages),
        languageDesc: str(entry.language_desc),
      };

    case "subraces":
      return {
        ...draft,
        parentRef: refFromIndex((entry.race as StoredEntry)?.index, parentSource),
        parentName: str((entry.race as StoredEntry)?.name),
        // A subrace's `desc` is a single string upstream, not an array.
        desc: str(entry.desc),
        abilityBonuses: bonusFields(entry.ability_bonuses),
      };

    case "equipment":
      return {
        ...draft,
        category: str((entry.equipment_category as StoredEntry)?.name),
        costQuantity: numText((entry.cost as StoredEntry)?.quantity),
        costUnit: str((entry.cost as StoredEntry)?.unit),
        weight: numText(entry.weight),
        desc: proseOf(entry.desc),
      };

    case "spells":
      return {
        ...draft,
        desc: proseOf(entry.desc),
        range: str(entry.range),
        components: Array.isArray(entry.components) ? entry.components.map(str).join(", ") : "",
        ritual: bool(entry.ritual),
        duration: str(entry.duration),
        concentration: bool(entry.concentration),
        castingTime: str(entry.casting_time),
        level: numText(entry.level),
        school: str((entry.school as StoredEntry)?.name),
        classNames: Array.isArray(entry.classes)
          ? entry.classes.map((one) => str((one as StoredEntry)?.name)).filter((one) => one !== "")
          : [],
      };

    case "subclasses":
      return {
        ...draft,
        parentRef: refFromIndex((entry.class as StoredEntry)?.index, parentSource),
        parentName: str((entry.class as StoredEntry)?.name),
        desc: proseOf(entry.desc),
      };

    case "classes":
    case "backgrounds":
      return draft;
  }
}
