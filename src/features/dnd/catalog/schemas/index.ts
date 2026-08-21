import type * as z from "zod";
import { AbilityScoreSchema } from "@/features/dnd/catalog/schemas/ability-scores";
import { BackgroundSchema } from "@/features/dnd/catalog/schemas/backgrounds";
import { ClassSchema } from "@/features/dnd/catalog/schemas/classes";
import { EquipmentSchema } from "@/features/dnd/catalog/schemas/equipment";
import { EquipmentCategorySchema } from "@/features/dnd/catalog/schemas/equipment-categories";
import { FeatureSchema } from "@/features/dnd/catalog/schemas/features";
import { LevelSchema } from "@/features/dnd/catalog/schemas/levels";
import { ProficiencySchema } from "@/features/dnd/catalog/schemas/proficiencies";
import { RaceSchema } from "@/features/dnd/catalog/schemas/races";
import { SkillSchema } from "@/features/dnd/catalog/schemas/skills";
import { SpellSchema } from "@/features/dnd/catalog/schemas/spells";
import { SubclassSchema } from "@/features/dnd/catalog/schemas/subclasses";
import { SubraceSchema } from "@/features/dnd/catalog/schemas/subraces";
import { TraitSchema } from "@/features/dnd/catalog/schemas/traits";

/**
 * The upstream zod schemas, keyed by catalog id.
 *
 * These are **vendored as source**, not depended on: upstream marks the
 * package `"private": true` and never publishes it. See
 * `src/features/dnd/catalog/schemas/README.md` for provenance and how to
 * re-vendor.
 *
 * Types are **inferred from these schemas**, never hand-written in parallel —
 * a hand-written type would drift from the validator silently.
 */
export const CATALOG_SCHEMAS = {
  ability_scores: AbilityScoreSchema,
  backgrounds: BackgroundSchema,
  classes: ClassSchema,
  equipment: EquipmentSchema,
  equipment_categories: EquipmentCategorySchema,
  features: FeatureSchema,
  levels: LevelSchema,
  proficiencies: ProficiencySchema,
  races: RaceSchema,
  skills: SkillSchema,
  spells: SpellSchema,
  subclasses: SubclassSchema,
  subraces: SubraceSchema,
  traits: TraitSchema,
} as const;

/** The entry type for one catalog, inferred from that catalog's schema. */
export type CatalogEntryOf<Id extends keyof typeof CATALOG_SCHEMAS> = z.infer<(typeof CATALOG_SCHEMAS)[Id]>;

export type AbilityScore = CatalogEntryOf<"ability_scores">;
export type Background = CatalogEntryOf<"backgrounds">;
/** CONTEXT.md calls this a class; `class` is a reserved word, hence the rename. */
export type CharacterClass = CatalogEntryOf<"classes">;
export type Equipment = CatalogEntryOf<"equipment">;
export type EquipmentCategory = CatalogEntryOf<"equipment_categories">;
export type Feature = CatalogEntryOf<"features">;
export type Level = CatalogEntryOf<"levels">;
export type Proficiency = CatalogEntryOf<"proficiencies">;
export type Race = CatalogEntryOf<"races">;
export type Skill = CatalogEntryOf<"skills">;
export type Spell = CatalogEntryOf<"spells">;
export type Subclass = CatalogEntryOf<"subclasses">;
export type Subrace = CatalogEntryOf<"subraces">;
export type Trait = CatalogEntryOf<"traits">;
