import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogId, Manifest, ManifestEntry } from "@/features/dnd/catalog/manifest";
import { MANIFEST_FILENAME, MANIFEST_PATH, manifestSchema, VENDOR_DIR } from "@/features/dnd/catalog/manifest";
import type { SyncFetch } from "@/features/dnd/catalog/sync";
import {
  fetchManifest,
  INSTALLED_VERSION_KEY,
  isCatalogInstalled,
  isTierInstalled,
  readInstalledVersion,
  SyncError,
  seedCatalog,
  syncTier,
} from "@/features/dnd/catalog/sync";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { createTestDb, destroyTestDb } from "@/test/db";

/**
 * The sync core is exercised over a stubbed fetch and `fake-indexeddb`, with
 * no browser and no React involved — that is the seam this ticket asks for.
 */

let db: SheetcraftDb;

/**
 * The stub serves the **real vendored bytes** from `public/srd/`. Hand-authored
 * entries would have to satisfy the upstream `z.strictObject` schemas, and a
 * fixture written to satisfy a validator proves only that it was written to
 * satisfy the validator. Reading the shipped files instead means the parse step
 * is exercised against the content the app actually installs.
 */
const PUBLIC_DIR = fileURLToPath(new URL("../../../../public", import.meta.url));

function readVendored(filename: string): string {
  return readFileSync(`${PUBLIC_DIR}/${VENDOR_DIR}/${filename}`, "utf8");
}

/** The shipped manifest, optionally re-versioned to simulate an upstream bump. */
function manifestFixture(version = 1): Manifest {
  const shipped = manifestSchema.parse(JSON.parse(readVendored(MANIFEST_FILENAME)));
  return { ...shipped, version };
}

type StubOptions = {
  manifest?: Manifest;
  /** Catalog ids that should fail, and how. */
  fail?: Partial<Record<CatalogId, "network" | "http" | "malformed">>;
  onFetch?: (url: string) => void;
};

/** A `fetch` over the vendored files on disk. No network, no browser. */
function stubFetch({ manifest = manifestFixture(), fail = {}, onFetch }: StubOptions = {}): SyncFetch {
  const byFilename = new Map(manifest.catalogs.map((entry) => [entry.filename, entry.id]));

  return async (url) => {
    onFetch?.(url);

    if (url.endsWith(MANIFEST_PATH)) {
      return jsonResponse(manifest);
    }

    const filename = url.slice(url.lastIndexOf("/") + 1);
    const id = byFilename.get(filename);
    if (!id) {
      return new Response("not found", { status: 404 });
    }

    const mode = fail[id];
    if (mode === "network") {
      throw new TypeError("Failed to fetch");
    }
    if (mode === "http") {
      return new Response("not found", { status: 404 });
    }
    if (mode === "malformed") {
      return jsonResponse([{ nope: true }]);
    }

    return new Response(readVendored(filename), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  db = createTestDb("sync");
});

afterEach(async () => {
  await destroyTestDb(db);
});

describe("installed state", () => {
  it("reports no installed version on a fresh database", async () => {
    await expect(readInstalledVersion(db)).resolves.toBeNull();
  });

  it("is not installed when the version matches but a tier-1 table is empty", async () => {
    const manifest = manifestFixture();
    await db.dnd_meta.put({ key: INSTALLED_VERSION_KEY, value: manifest.version });

    await expect(isCatalogInstalled(manifest, db)).resolves.toBe(false);
  });

  it("is not installed when tier 1 is populated but the version differs", async () => {
    await seedTier1(manifestFixture(1));
    await db.dnd_meta.put({ key: INSTALLED_VERSION_KEY, value: 1 });

    await expect(isCatalogInstalled(manifestFixture(2), db)).resolves.toBe(false);
  });

  it("is installed when the version matches and every tier-1 table is populated", async () => {
    const manifest = manifestFixture();
    await seedTier1(manifest);

    await expect(isCatalogInstalled(manifest, db)).resolves.toBe(true);
  });
});

describe("seedCatalog", () => {
  it("parses before opening the transaction", async () => {
    // If parsing happened inside the transaction, the awaited fetch would
    // auto-commit it. Asserted by ordering: no write lands before the parse.
    const order: string[] = [];
    const fetchImpl = stubFetch({ onFetch: (url) => order.push(`fetch:${url}`) });
    db.dnd_catalog_races.hook("creating", () => {
      order.push("write");
    });

    await seedCatalog(entryFor("races"), { db, fetch: fetchImpl });

    expect(order[0]).toMatch(/^fetch:/);
    expect(order).toContain("write");
  });

  it("upserts rather than adding, so a re-seed over existing rows succeeds", async () => {
    await db.dnd_catalog_races.put({ index: "human", name: "Stale Human" });

    await seedCatalog(entryFor("races"), { db, fetch: stubFetch() });

    await expect(db.dnd_catalog_races.get("human")).resolves.toMatchObject({ name: "Human" });
  });

  it("replaces the whole catalog, so an entry dropped upstream disappears", async () => {
    await db.dnd_catalog_races.put({ index: "gone", name: "Removed Upstream" });

    await seedCatalog(entryFor("races"), { db, fetch: stubFetch() });

    await expect(db.dnd_catalog_races.get("gone")).resolves.toBeUndefined();
  });

  it("leaves the OLD data intact when the write throws mid-seed", async () => {
    await db.dnd_catalog_races.bulkPut([
      { index: "old-a", name: "Old A" },
      { index: "old-b", name: "Old B" },
    ]);
    const restore = failNextBulkPut(new Error("disk on fire"));

    await expect(seedCatalog(entryFor("races"), { db, fetch: stubFetch() })).rejects.toBeInstanceOf(SyncError);

    // `clear()` ran before the throw. The rows are still here because the two
    // share one transaction, so the failure rolled the clear back too.
    const rows = await db.dnd_catalog_races.orderBy("index").toArray();
    expect(rows.map((row) => row.index)).toEqual(["old-a", "old-b"]);
    restore();
  });

  it("keeps the old data when the payload fails validation", async () => {
    await db.dnd_catalog_races.put({ index: "old", name: "Old" });

    const error = await seedCatalog(entryFor("races"), {
      db,
      fetch: stubFetch({ fail: { races: "malformed" } }),
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(SyncError);
    expect((error as SyncError).kind).toBe("malformed");
    await expect(db.dnd_catalog_races.get("old")).resolves.toMatchObject({ name: "Old" });
  });

  it("never touches homebrew", async () => {
    await db.dnd_homebrew_races.put({ index: "azureborn", name: "Azureborn", updatedAt: new Date() });

    await seedCatalog(entryFor("races"), { db, fetch: stubFetch() });

    await expect(db.dnd_homebrew_races.get("azureborn")).resolves.toMatchObject({ name: "Azureborn" });
  });

  it.each([
    ["network", "offline"],
    ["http", "http"],
    ["malformed", "malformed"],
  ] as const)("classifies a %s failure as %s", async (mode, kind) => {
    const error = await seedCatalog(entryFor("races"), {
      db,
      fetch: stubFetch({ fail: { races: mode } }),
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(SyncError);
    expect((error as SyncError).kind).toBe(kind);
    expect((error as SyncError).catalogId).toBe("races");
  });

  // A quota failure does not arrive flat. Dexie re-wraps the DOM error with the
  // original on `inner`, and a `bulkPut` that hits the limit surfaces a
  // `BulkError` whose per-row `failures` hold it — so all three shapes must be
  // recognised, or the distinct message never fires in the case it exists for.
  it.each([
    ["the bare DOM error", () => new DOMException("quota", "QuotaExceededError")],
    [
      "a Dexie wrapper carrying it on `inner`",
      () => Object.assign(new Error("wrapped"), { name: "QuotaExceededError", inner: new Error("disk full") }),
    ],
    [
      "a Dexie wrapper whose own name is generic",
      () =>
        Object.assign(new Error("wrapped"), {
          name: "DexieError",
          inner: new DOMException("quota", "QuotaExceededError"),
        }),
    ],
    [
      "a BulkError listing it among `failures`",
      () =>
        Object.assign(new Error("bulk"), {
          name: "BulkError",
          failures: [new Error("unrelated"), new DOMException("quota", "QuotaExceededError")],
        }),
    ],
  ])("classifies %s as quota, since retrying will not help", async (_shape, build) => {
    const restore = failNextBulkPut(build());

    const error = await seedCatalog(entryFor("races"), { db, fetch: stubFetch() }).catch((thrown: unknown) => thrown);

    expect((error as SyncError).kind).toBe("quota");
    expect((error as SyncError).retryable).toBe(false);
    restore();
  });

  it("does not mistake an ordinary BulkError for a quota failure", async () => {
    const restore = failNextBulkPut(
      Object.assign(new Error("bulk"), { name: "BulkError", failures: [new Error("constraint")] }),
    );

    const error = await seedCatalog(entryFor("races"), { db, fetch: stubFetch() }).catch((thrown: unknown) => thrown);

    expect((error as SyncError).kind).toBe("write");
    expect((error as SyncError).retryable).toBe(true);
    restore();
  });
});

describe("syncTier", () => {
  it("seeds every tier-1 catalog and writes the version last", async () => {
    const manifest = manifestFixture(7);

    await syncTier(1, manifest, { db, fetch: stubFetch({ manifest }) });

    await expect(db.dnd_catalog_classes.count()).resolves.toBe(12);
    await expect(db.dnd_catalog_levels.count()).resolves.toBeGreaterThan(0);
    await expect(readInstalledVersion(db)).resolves.toBe(7);
    // Tier 2 is not this call's business.
    await expect(db.dnd_catalog_spells.count()).resolves.toBe(0);
  });

  it("does not write the version when a tier-1 catalog fails, so the sync re-runs", async () => {
    const manifest = manifestFixture();

    await expect(
      syncTier(1, manifest, { db, fetch: stubFetch({ manifest, fail: { levels: "http" } }) }),
    ).rejects.toBeInstanceOf(SyncError);

    await expect(readInstalledVersion(db)).resolves.toBeNull();
    await expect(isCatalogInstalled(manifest, db)).resolves.toBe(false);
  });

  it("leaves the previously installed version untouched when a re-sync fails", async () => {
    const manifest = manifestFixture(2);
    await db.dnd_meta.put({ key: INSTALLED_VERSION_KEY, value: 1 });

    await expect(
      syncTier(1, manifest, { db, fetch: stubFetch({ manifest, fail: { races: "network" } }) }),
    ).rejects.toBeInstanceOf(SyncError);

    await expect(readInstalledVersion(db)).resolves.toBe(1);
  });

  it("never writes the gate's version for tier 2 — tier 1 alone owns the key that blocks", async () => {
    const manifest = manifestFixture(3);

    await syncTier(2, manifest, { db, fetch: stubFetch({ manifest }) });

    await expect(db.dnd_catalog_spells.count()).resolves.toBeGreaterThan(0);
    // Tier 2 completing must never let the gate through on its own.
    await expect(readInstalledVersion(db)).resolves.toBeNull();
    await expect(isCatalogInstalled(manifest, db)).resolves.toBe(false);
    // It does record its own completion, so a warm start skips the 186 KB.
    await expect(isTierInstalled(2, manifest, db)).resolves.toBe(true);
  });

  it("does not consider tier 2 installed at a different manifest version", async () => {
    const manifest = manifestFixture(3);
    await syncTier(2, manifest, { db, fetch: stubFetch({ manifest }) });

    await expect(isTierInstalled(2, manifestFixture(4), db)).resolves.toBe(false);
  });

  it("does not mark tier 2 installed when one of its catalogs fails", async () => {
    const manifest = manifestFixture();

    await expect(
      syncTier(2, manifest, { db, fetch: stubFetch({ manifest, fail: { spells: "http" } }) }),
    ).rejects.toBeInstanceOf(SyncError);

    await expect(isTierInstalled(2, manifest, db)).resolves.toBe(false);
  });

  it("reports progress per catalog", async () => {
    const manifest = manifestFixture();
    const seen: Array<{ completed: number; total: number }> = [];

    await syncTier(1, manifest, {
      db,
      fetch: stubFetch({ manifest }),
      onProgress: (progress) => seen.push({ completed: progress.completed, total: progress.total }),
    });

    expect(seen.at(-1)).toEqual({ completed: 5, total: 5 });
    expect(seen.every((progress) => progress.total === 5)).toBe(true);
  });
});

describe("fetchManifest", () => {
  it("returns the shipped manifest", async () => {
    const manifest = manifestFixture(4);

    await expect(fetchManifest({ fetch: stubFetch({ manifest }) })).resolves.toMatchObject({ version: 4 });
  });

  it("classifies a manifest that fails its own schema as malformed, with no catalog attached", async () => {
    const fetchImpl: SyncFetch = async () => jsonResponse({ version: "not a number" });

    const error = await fetchManifest({ fetch: fetchImpl }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(SyncError);
    expect((error as SyncError).kind).toBe("malformed");
    expect((error as SyncError).catalogId).toBeNull();
  });

  it("requests the manifest with no-cache — it is the one file that is not content-hashed", async () => {
    const seen: RequestCache[] = [];
    const fetchImpl: SyncFetch = async (_url, init) => {
      seen.push(init?.cache ?? "default");
      return jsonResponse(manifestFixture());
    };

    await fetchManifest({ fetch: fetchImpl });

    expect(seen).toEqual(["no-cache"]);
  });
});

describe("the interrupted sync re-runs", () => {
  it("completes on a second attempt after the first fails part-way", async () => {
    const manifest = manifestFixture(5);

    await expect(
      syncTier(1, manifest, { db, fetch: stubFetch({ manifest, fail: { subraces: "network" } }) }),
    ).rejects.toBeInstanceOf(SyncError);
    await expect(isCatalogInstalled(manifest, db)).resolves.toBe(false);

    await syncTier(1, manifest, { db, fetch: stubFetch({ manifest }) });

    await expect(isCatalogInstalled(manifest, db)).resolves.toBe(true);
  });

  it("leaves homebrew untouched across a full tier-1 re-seed", async () => {
    const manifest = manifestFixture();
    await db.dnd_homebrew_races.put({ index: "azureborn", name: "Azureborn", updatedAt: new Date() });
    await db.dnd_homebrew_subclasses.put({ index: "stormcaller", name: "Stormcaller", updatedAt: new Date() });

    await syncTier(1, manifest, { db, fetch: stubFetch({ manifest }) });
    await syncTier(1, manifest, { db, fetch: stubFetch({ manifest }) });

    await expect(db.dnd_homebrew_races.count()).resolves.toBe(1);
    await expect(db.dnd_homebrew_subclasses.count()).resolves.toBe(1);
  });

  it("costs one manifest fetch and nothing more once tier 1 is installed — the no-gate path", async () => {
    const manifest = manifestFixture();
    await syncTier(1, manifest, { db, fetch: stubFetch({ manifest }) });

    // What the gate does on a warm start: read the manifest, check installed
    // state. If that answers yes, no catalog is fetched at all.
    const urls: string[] = [];
    const fetchImpl = stubFetch({ manifest, onFetch: (url) => urls.push(url) });

    const fetched = await fetchManifest({ fetch: fetchImpl });
    await expect(isCatalogInstalled(fetched, db)).resolves.toBe(true);

    expect(urls).toEqual([`/${MANIFEST_PATH}`]);
  });
});

/**
 * Makes the next `bulkPut` reject, whichever `Table` handle the subject holds.
 * `db.table(name)` returns a *different* instance from `db.dnd_catalog_races`,
 * so spying on the named property would silently miss — hence patching the
 * lookup itself rather than one handle.
 */
function failNextBulkPut(reason: unknown): () => void {
  const table = vi.spyOn(db, "table").mockImplementationOnce((name: string) => {
    const real = db.tables.find((candidate) => candidate.name === name);
    if (!real) {
      throw new Error(`no such table ${name}`);
    }
    return Object.create(real, {
      bulkPut: { value: () => Promise.reject(reason) },
    });
  });
  return () => table.mockRestore();
}

/** The manifest entry for one catalog, from the default fixture. */
function entryFor(id: CatalogId): ManifestEntry {
  const entry = manifestFixture().catalogs.find((catalog) => catalog.id === id);
  if (!entry) {
    throw new Error(`no fixture entry for ${id}`);
  }
  return entry;
}

/** Populates the tier-1 tables and marks the manifest version installed. */
async function seedTier1(manifest: Manifest): Promise<void> {
  await syncTier(1, manifest, { db, fetch: stubFetch({ manifest }) });
}
