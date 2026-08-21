import * as z from "zod";

/**
 * What the vendoring pipeline produces and the sync gate consumes. Types only
 * plus a zod schema — no filesystem and no network, so this module is safe to
 * import from the app, the script, and tests alike.
 *
 * See CONTEXT.md § Catalog and § Catalog tier.
 */

/** Where the vendored JSON came from. Recorded so the pin is auditable from the artefact. */
export const UPSTREAM_REPO = "5e-bits/5e-database";

/**
 * The pinned upstream commit. **Not optional.** The upstream zod schemas are
 * `z.strictObject`, so a field added upstream hard-fails validation rather
 * than degrading; floating on a branch would turn that into a surprise.
 *
 * Bump deliberately: re-pin, re-run `scripts/vendor-srd.ts`, re-run the tests.
 */
export const UPSTREAM_SHA = "bfd3db4bcc31699cce703b46feb9af3f0ff08999";

/**
 * The locale-qualified upstream directory. Note the locale layer — there is a
 * parallel `src/2024/` tree, and this project is 2014-only. See CONTEXT.md.
 */
export const UPSTREAM_DIR = "src/2014/en";

/** The directory under `public/` the vendored files land in. */
export const VENDOR_DIR = "srd";

/** The manifest's filename. Not content-hashed — it is the fixed entry point. */
export const MANIFEST_FILENAME = "manifest.json";

/** Where the emitted manifest lives, relative to `public/`. */
export const MANIFEST_PATH = `${VENDOR_DIR}/${MANIFEST_FILENAME}`;

/**
 * The manifest version the sync gate compares against `dnd_meta.manifestVersion`.
 * Bump when the *shape* of the vendored set changes — a re-pin alone does not
 * need it, because the data filenames are content-hashed.
 */
export const MANIFEST_VERSION = 1;

/**
 * Which load phase a catalog belongs to. A number, not a `required` boolean:
 * booleans are not indexable in Dexie and the tier carries more meaning.
 */
export type Tier = 1 | 2;

/**
 * How much of the content digest goes into a filename. 64 bits is ample
 * against accidental collision. Declared here, beside the schema that
 * validates against it, so the length is stated exactly once.
 */
export const HASH_LENGTH = 16;

/**
 * Tier 1 — the minimal-creation set, ~32 KB gzipped, which the sync gate
 * blocks on. `levels` is here because subclass timing is only derivable from
 * it. Everything not listed is tier 2 and downloads in the background.
 */
export const TIER_1 = ["classes", "subclasses", "races", "subraces", "levels"] as const;

/**
 * The 14 catalogs, each mapped to the upstream filename it is copied from
 * verbatim. The ids match the `dnd_catalog_*` table suffixes in
 * `features/dnd/db/db.ts`, so a manifest entry names its own destination table.
 */
export const CATALOGS = [
  { id: "ability_scores", upstream: "5e-SRD-Ability-Scores.json" },
  { id: "backgrounds", upstream: "5e-SRD-Backgrounds.json" },
  { id: "classes", upstream: "5e-SRD-Classes.json" },
  { id: "equipment", upstream: "5e-SRD-Equipment.json" },
  { id: "equipment_categories", upstream: "5e-SRD-Equipment-Categories.json" },
  { id: "features", upstream: "5e-SRD-Features.json" },
  { id: "levels", upstream: "5e-SRD-Levels.json" },
  { id: "proficiencies", upstream: "5e-SRD-Proficiencies.json" },
  { id: "races", upstream: "5e-SRD-Races.json" },
  { id: "skills", upstream: "5e-SRD-Skills.json" },
  { id: "spells", upstream: "5e-SRD-Spells.json" },
  { id: "subclasses", upstream: "5e-SRD-Subclasses.json" },
  { id: "subraces", upstream: "5e-SRD-Subraces.json" },
  { id: "traits", upstream: "5e-SRD-Traits.json" },
] as const;

export type CatalogId = (typeof CATALOGS)[number]["id"];

/**
 * The tier a catalog belongs to. Tier 1 is a closed list; everything else is
 * background. Typed as a `Set<CatalogId>` so a typo in `TIER_1` fails to
 * compile rather than silently demoting a catalog to tier 2.
 */
const TIER_1_IDS: ReadonlySet<CatalogId> = new Set<CatalogId>(TIER_1);

export function tierOf(id: CatalogId): Tier {
  return TIER_1_IDS.has(id) ? 1 : 2;
}

const catalogIds = CATALOGS.map((catalog) => catalog.id) as [CatalogId, ...CatalogId[]];

/** One vendored file. `filename` is content-hashed, hence immutably cacheable. */
export const manifestEntrySchema = z.strictObject({
  id: z.enum(catalogIds),
  filename: z
    .string()
    .regex(new RegExp(`^[a-z_]+\\.[0-9a-f]{${HASH_LENGTH}}\\.json$`), "filename must be content-hashed"),
  bytes: z.int().positive(),
  tier: z.union([z.literal(1), z.literal(2)]),
});

export type ManifestEntry = z.infer<typeof manifestEntrySchema>;

/**
 * A single global `version` covers the whole set; the files themselves are
 * content-hashed, so per-file versions would be redundant bookkeeping. The
 * sync gate clears when this matches `dnd_meta.manifestVersion`.
 */
export const manifestSchema = z.strictObject({
  version: z.int().positive(),
  upstream: z.strictObject({
    repo: z.literal(UPSTREAM_REPO),
    sha: z.string().regex(/^[0-9a-f]{40}$/, "upstream.sha must be a full commit SHA"),
    dir: z.literal(UPSTREAM_DIR),
  }),
  license: z.strictObject({
    code: z.literal("MIT"),
    content: z.literal("OGL-1.0a"),
  }),
  catalogs: z
    .array(manifestEntrySchema)
    .length(CATALOGS.length)
    .refine(
      (entries) => new Set(entries.map((entry) => entry.id)).size === entries.length,
      "catalog ids must be unique",
    ),
});

export type Manifest = z.infer<typeof manifestSchema>;
