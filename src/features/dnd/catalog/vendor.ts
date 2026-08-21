import { createHash } from "node:crypto";
import type { CatalogId, Manifest, ManifestEntry } from "@/features/dnd/catalog/manifest";
import {
  CATALOGS,
  HASH_LENGTH,
  manifestSchema,
  tierOf,
  UPSTREAM_DIR,
  UPSTREAM_REPO,
} from "@/features/dnd/catalog/manifest";

/**
 * The pure core of the vendoring pipeline: bytes in, manifest out. No
 * filesystem and no network live here — `scripts/vendor-srd.ts` is the shell
 * that fetches and writes, and this is the part the tests exercise.
 */

/** The SHA-256 of the bytes, hex-encoded. */
export function contentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * `races.<hash>.json` — the id stays readable while the hash makes the URL
 * immutable, so `public/` can be served with a far-future cache header and a
 * re-vendor is a new URL rather than a cache bust.
 */
export function hashedFilename(id: CatalogId, bytes: Uint8Array): string {
  return `${id}.${contentHash(bytes).slice(0, HASH_LENGTH)}.json`;
}

export type BuildManifestInput = {
  /** The pinned upstream commit the bytes were copied from. */
  sha: string;
  /** The single global manifest version. */
  version: number;
  /** Verbatim upstream bytes, keyed by catalog id. Every catalog must be present. */
  sources: ReadonlyMap<CatalogId, Uint8Array>;
};

/**
 * Builds the manifest from the vendored bytes and validates it before
 * returning, so an invalid manifest can never reach `public/`.
 *
 * Deterministic by construction: entries are ordered by catalog id and every
 * field derives from the bytes, so re-running against unchanged upstream
 * content produces a byte-identical manifest and therefore no diff.
 */
export function buildManifest({ sha, version, sources }: BuildManifestInput): Manifest {
  // Sorted by id, so the order the sources arrived in cannot reorder the
  // manifest. `map` already yields a fresh array, so sorting in place is safe.
  // Default `sort` is lexicographic on strings, which is what ids need.
  const catalogs: ManifestEntry[] = CATALOGS.map((catalog) => catalog.id)
    .sort()
    .map((id) => {
      const bytes = sources.get(id);
      if (!bytes) {
        throw new Error(`No vendored bytes for catalog "${id}"`);
      }

      return {
        id,
        filename: hashedFilename(id, bytes),
        bytes: bytes.byteLength,
        tier: tierOf(id),
      };
    });

  return manifestSchema.parse({
    version,
    upstream: { repo: UPSTREAM_REPO, sha, dir: UPSTREAM_DIR },
    license: { code: "MIT", content: "OGL-1.0a" },
    catalogs,
  });
}
