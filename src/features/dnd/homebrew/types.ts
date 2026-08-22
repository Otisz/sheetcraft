import type { CATALOG_SCHEMAS } from "@/features/dnd/catalog/schemas";
import type { TableName } from "@/features/dnd/db/db";

/**
 * The homebrew feature's vocabulary: which catalog types are authorable, and
 * which editing surface each one gets.
 *
 * The tier is driven by MEASURED entry complexity, not by taste — see
 * CONTEXT.md § Homebrew authoring tiers. A `class` has 190 leaves nested 11
 * deep; a phone form for it is not buildable, and pretending otherwise would
 * ship a form that can only produce invalid entries.
 */

/** How an entry is edited. Every type additionally accepts the JSON editor. */
export type AuthoringTier =
  /** A field-by-field form: shallow enough for a phone. */
  | "form"
  /** A deliberately partial form; the JSON editor is the rest of the schema. */
  | "minimal-form"
  /** JSON only — a form would be unbuildable. */
  | "json";

export type HomebrewTypeSpec = {
  /** Singular, for headings and prose. */
  label: string;
  /** Plural, for group headings and counts. */
  plural: string;
  tier: AuthoringTier;
  /** Measured leaf-field count, the number the tier was chosen from. */
  leaves: number;
  /** The homebrew table this type is stored in. */
  table: TableName;
  /**
   * Which character fields may point at this type. Drives the delete-block
   * scan, so a type missing from here would be deletable while referenced.
   */
  referencedBy: readonly CharacterRefLocation[];
};

/**
 * Where in a character record a ref to homebrew can sit. Named rather than
 * described by a path string so the scan is a `switch` the compiler checks,
 * not a runtime path walk that fails silently on a typo.
 */
export type CharacterRefLocation =
  | "classRef"
  | "subclassRef"
  | "raceRef"
  | "subraceRef"
  | "backgroundRef"
  | "equipment"
  | "spells";

/**
 * The seven authorable types. Keyed by the catalog id, so a spec key is
 * always a `CATALOG_SCHEMAS` key and the validator lookup cannot miss.
 */
export const HOMEBREW_TYPES = {
  races: {
    label: "Race",
    plural: "Races",
    tier: "form",
    leaves: 49,
    table: "dnd_homebrew_races",
    referencedBy: ["raceRef"],
  },
  subraces: {
    label: "Subrace",
    plural: "Subraces",
    tier: "form",
    leaves: 16,
    table: "dnd_homebrew_subraces",
    referencedBy: ["subraceRef"],
  },
  classes: {
    label: "Class",
    plural: "Classes",
    tier: "json",
    leaves: 190,
    table: "dnd_homebrew_classes",
    referencedBy: ["classRef"],
  },
  subclasses: {
    label: "Subclass",
    plural: "Subclasses",
    tier: "minimal-form",
    leaves: 625,
    table: "dnd_homebrew_subclasses",
    referencedBy: ["subclassRef"],
  },
  backgrounds: {
    label: "Background",
    plural: "Backgrounds",
    tier: "json",
    leaves: 168,
    table: "dnd_homebrew_backgrounds",
    referencedBy: ["backgroundRef"],
  },
  equipment: {
    label: "Equipment",
    plural: "Equipment",
    tier: "form",
    leaves: 15,
    table: "dnd_homebrew_equipment",
    referencedBy: ["equipment"],
  },
  spells: {
    label: "Spell",
    plural: "Spells",
    tier: "form",
    leaves: 32,
    table: "dnd_homebrew_spells",
    referencedBy: ["spells"],
  },
} as const satisfies Record<string, HomebrewTypeSpec>;

/** The closed set of authorable type ids. */
export type HomebrewType = keyof typeof HOMEBREW_TYPES;

/**
 * Type ids in the order the list page groups them: the two most-authored
 * types first, then the rest. Not alphabetical — `backgrounds` leading a list
 * whose point is races and equipment would bury both.
 */
export const HOMEBREW_TYPE_ORDER: readonly HomebrewType[] = [
  "races",
  "subraces",
  "classes",
  "subclasses",
  "backgrounds",
  "equipment",
  "spells",
];

/** Narrows an arbitrary string — a URL segment — to a type id. */
export function isHomebrewType(value: string): value is HomebrewType {
  return Object.hasOwn(HOMEBREW_TYPES, value);
}

/** The table one type is stored in. */
export function tableFor(type: HomebrewType): TableName {
  return HOMEBREW_TYPES[type].table;
}

/**
 * Compile-time assertion that every authorable type has a vendored schema to
 * validate against. Without it, a type added here with no matching schema
 * would only fail when someone tried to save one.
 */
type _EveryTypeHasASchema = HomebrewType extends keyof typeof CATALOG_SCHEMAS ? true : never;
const _schemaCoverage: _EveryTypeHasASchema = true;
void _schemaCoverage;
