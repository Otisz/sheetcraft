#!/usr/bin/env bun
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CATALOGS,
  MANIFEST_FILENAME,
  MANIFEST_PATH,
  MANIFEST_VERSION,
  UPSTREAM_DIR,
  UPSTREAM_REPO,
  UPSTREAM_SHA,
  VENDOR_DIR,
} from "@/features/dnd/catalog/manifest";
import { buildManifest } from "@/features/dnd/catalog/vendor";

/**
 * Vendors the SRD catalogs into `public/` as ours.
 *
 * Run **manually**, not on every build:
 *
 *   docker compose exec app bun run vendor:srd
 *
 * It copies JSON verbatim from the pinned upstream commit, rewrites filenames
 * with content hashes, and emits the manifest. Because every output derives
 * from the bytes, re-running it against an unchanged pin produces no diff.
 *
 * To take an upstream update: bump `UPSTREAM_SHA` in
 * `src/features/dnd/catalog/manifest.ts`, re-run this, re-vendor the zod
 * schemas, and run the tests. The pin is deliberate — the upstream schemas are
 * `z.strictObject`, so a new field upstream hard-fails validation rather than
 * degrading.
 */

const PUBLIC_DIR = join(import.meta.dirname, "..", "public");
const OUT_DIR = join(PUBLIC_DIR, VENDOR_DIR);

/** Fetches one upstream file verbatim, at the pinned commit. */
async function fetchUpstream(filename: string): Promise<Uint8Array> {
  const url = `https://raw.githubusercontent.com/${UPSTREAM_REPO}/${UPSTREAM_SHA}/${UPSTREAM_DIR}/${filename}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} → ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Removes vendored files that are no longer named by the manifest. Content
 * hashing means a changed catalog lands under a new filename; without this the
 * old one would linger forever.
 */
async function pruneStale(keep: ReadonlySet<string>): Promise<string[]> {
  const present = await readdir(OUT_DIR).catch(() => [] as string[]);
  const stale = present.filter((name) => name.endsWith(".json") && !keep.has(name));
  await Promise.all(stale.map((name) => rm(join(OUT_DIR, name))));
  return stale;
}

async function main(): Promise<void> {
  console.log(
    `Vendoring ${CATALOGS.length} catalogs from ${UPSTREAM_REPO}@${UPSTREAM_SHA.slice(0, 8)}/${UPSTREAM_DIR}`,
  );
  await mkdir(OUT_DIR, { recursive: true });

  const downloaded = await Promise.all(
    CATALOGS.map(async (catalog) => [catalog.id, await fetchUpstream(catalog.upstream)] as const),
  );
  const sources = new Map(downloaded);

  const manifest = buildManifest({ sha: UPSTREAM_SHA, version: MANIFEST_VERSION, sources });

  for (const entry of manifest.catalogs) {
    const bytes = sources.get(entry.id);
    if (!bytes) {
      throw new Error(`No bytes for ${entry.id}`);
    }
    await writeFile(join(OUT_DIR, entry.filename), bytes);
    console.log(`  tier ${entry.tier}  ${entry.filename}  ${(entry.bytes / 1024).toFixed(1)} KB`);
  }

  const keep = new Set([...manifest.catalogs.map((entry) => entry.filename), MANIFEST_FILENAME]);
  const pruned = await pruneStale(keep);
  for (const name of pruned) {
    console.log(`  pruned  ${name}`);
  }

  // A trailing newline and stable key order, so the file is diff-friendly and
  // an unchanged upstream really does produce no diff.
  await writeFile(join(PUBLIC_DIR, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote public/${MANIFEST_PATH}`);
}

await main();
