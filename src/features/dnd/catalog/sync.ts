import type { CatalogId, Manifest, ManifestEntry, Tier } from "@/features/dnd/catalog/manifest";
import { MANIFEST_PATH, manifestSchema, TIER_1, VENDOR_DIR } from "@/features/dnd/catalog/manifest";
import { CATALOG_SCHEMAS } from "@/features/dnd/catalog/schemas";
import type { SheetcraftDb, TableName } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";
import type { CatalogEntry } from "@/features/dnd/db/schema";

/**
 * The sync gate's engine: manifest in, seeded catalog tables out. No React and
 * no browser globals beyond `fetch`, which is injected — so the whole thing is
 * exercised over a stub in `sync.test.ts`. See CONTEXT.md § Sync gate.
 *
 * The ordering here is load-bearing and every step is justified in
 * [the sync decision](https://github.com/Otisz/sheetcraft/issues/145):
 *
 *     parse and validate BEFORE opening the transaction
 *       → clear() + bulkPut() together in one transaction
 *         → the installed version written LAST, after every tier-1 catalog
 */

/**
 * The `dnd_meta` key recording which manifest version tier 1 is installed at.
 * This is the one the gate compares against — tier 1 alone decides whether the
 * app can render.
 */
export const INSTALLED_VERSION_KEY = "manifestVersion";

/**
 * The version tier 2 finished at. Not consulted by the gate — nothing ever
 * blocks on tier 2 — but consulted before *starting* it, so a warm start does
 * not re-download 186 KB on every mount. That is real bandwidth on exactly the
 * weak connection the tiering exists for.
 */
export const TIER_2_VERSION_KEY = "tier2Version";

/** Which `dnd_meta` key records a tier's completion. */
function versionKeyFor(tier: Tier): string {
  return tier === 1 ? INSTALLED_VERSION_KEY : TIER_2_VERSION_KEY;
}

/** The injected fetch. Narrower than the DOM signature — only what sync uses. */
export type SyncFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** How a sync failed. Drives the message, and whether a retry is worth offering. */
export type SyncErrorKind =
  /** The request never completed — offline, DNS, connection reset. */
  | "offline"
  /** The response arrived with a non-2xx status; a stale manifest 404s here. */
  | "http"
  /** The body was not JSON, or failed its zod schema. Keeps the old data. */
  | "malformed"
  /** IndexedDB is out of room. Retrying will not help. */
  | "quota"
  /** The write failed for any other reason. */
  | "write";

/** A sync failure carrying enough to render a message and decide on a retry. */
export class SyncError extends Error {
  readonly kind: SyncErrorKind;
  /** Which catalog was being installed, or `null` for the manifest itself. */
  readonly catalogId: CatalogId | null;

  constructor(kind: SyncErrorKind, message: string, options: { catalogId?: CatalogId | null; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "SyncError";
    this.kind = kind;
    this.catalogId = options.catalogId ?? null;
  }

  /**
   * Whether offering a retry is honest. Everything but a quota failure can
   * plausibly succeed on a second attempt; a full disk cannot.
   */
  get retryable(): boolean {
    return this.kind !== "quota";
  }
}

/** Progress across one tier, for the gate's indicator. `bytes` drives the bar. */
export type SyncProgress = {
  tier: Tier;
  completed: number;
  total: number;
  /** Bytes installed so far, per the manifest's declared sizes. */
  bytes: number;
  totalBytes: number;
  /** The catalog that just finished. */
  catalogId: CatalogId;
};

export type SyncOptions = {
  db?: SheetcraftDb;
  fetch?: SyncFetch;
  onProgress?: (progress: SyncProgress) => void;
  signal?: AbortSignal;
};

/** `SyncOptions` with the two injectables filled in. */
type ResolvedOptions = SyncOptions & {
  db: SheetcraftDb;
  fetch: SyncFetch;
};

/** Fills in the injectables, leaving everything else as the caller passed it. */
function resolveOptions(options: SyncOptions): ResolvedOptions {
  return {
    ...options,
    db: options.db ?? getDb(),
    // Bound to `globalThis`: an unbound `fetch` throws `Illegal invocation`.
    fetch: options.fetch ?? ((url, init) => globalThis.fetch(url, init)),
  };
}

/** The catalog table a manifest entry seeds. Ids match the table suffixes. */
function tableNameFor(id: CatalogId): TableName {
  return `dnd_catalog_${id}` as TableName;
}

/** Where a vendored file is served from. Absolute, so it resolves from any route. */
export function catalogUrl(entry: ManifestEntry): string {
  return `/${VENDOR_DIR}/${entry.filename}`;
}

/**
 * Fetches and parses the manifest. `no-cache` because it is the one file that
 * is *not* content-hashed — it is the fixed entry point that names the hashes.
 *
 * Takes no `db`: reading the manifest is pure network, and a parameter
 * suggesting otherwise would misdescribe what this touches.
 */
export async function fetchManifest(options: Pick<SyncOptions, "fetch" | "signal"> = {}): Promise<Manifest> {
  const { fetch, signal } = resolveOptions(options);
  const body = await fetchJson(`/${MANIFEST_PATH}`, { fetch, signal, cache: "no-cache", catalogId: null });

  const parsed = manifestSchema.safeParse(body);
  if (!parsed.success) {
    throw new SyncError("malformed", "The catalog manifest failed validation.", { cause: parsed.error });
  }
  return parsed.data;
}

/** The installed manifest version, or `null` if nothing has ever synced. */
export async function readInstalledVersion(db: SheetcraftDb = getDb()): Promise<number | null> {
  const row = await db.dnd_meta.get(INSTALLED_VERSION_KEY);
  return typeof row?.value === "number" ? row.value : null;
}

/**
 * Whether the gate can be skipped entirely: the installed version matches
 * *and* every tier-1 table actually holds rows.
 *
 * The second half is not redundant. The version row could survive a wipe of
 * the object stores, and a gate that trusted the number alone would render a
 * creation flow with empty pickers.
 */
export async function isCatalogInstalled(manifest: Manifest, db: SheetcraftDb = getDb()): Promise<boolean> {
  if ((await readInstalledVersion(db)) !== manifest.version) {
    return false;
  }

  const counts = await Promise.all(TIER_1.map((id) => db.table(tableNameFor(id)).count()));
  return counts.every((count) => count > 0);
}

/**
 * Installs one catalog: fetch, validate, then swap in a single transaction.
 *
 * Everything awaited outside the transaction is deliberate — awaiting a
 * non-Dexie promise *inside* one auto-commits it, and the next write then
 * throws `TransactionInactiveError`. `clear()` and `bulkPut()` together mean a
 * failure rolls back to the previous rows, so the table is never empty; and
 * `bulkPut` rather than `bulkAdd` because a re-seed is an upsert and a caught
 * `BulkError` from `bulkAdd` still persists its successful rows.
 */
export async function seedCatalog(entry: ManifestEntry, options: SyncOptions = {}): Promise<number> {
  const { db, fetch, signal } = resolveOptions(options);

  const body = await fetchJson(catalogUrl(entry), { fetch, signal, cache: "default", catalogId: entry.id });

  const parsed = CATALOG_SCHEMAS[entry.id].array().safeParse(body);
  if (!parsed.success) {
    throw new SyncError("malformed", `The "${entry.id}" catalog failed validation.`, {
      catalogId: entry.id,
      cause: parsed.error,
    });
  }

  // Cast rather than re-derive: the vendored schemas all carry `index`, and
  // Dexie stores the entries verbatim. See CONTEXT.md § Catalog.
  const rows = parsed.data as unknown as CatalogEntry[];
  const table = db.table<CatalogEntry>(tableNameFor(entry.id));

  try {
    await db.transaction("rw", table, async () => {
      await table.clear();
      await table.bulkPut(rows);
    });
  } catch (cause) {
    throw new SyncError(writeKind(cause), `Could not store the "${entry.id}" catalog.`, {
      catalogId: entry.id,
      cause,
    });
  }

  return rows.length;
}

/**
 * Installs every catalog in a tier, sequentially.
 *
 * Sequential rather than parallel on purpose: tier 1 is 32 KB total, the
 * bottleneck is a weak connection rather than request concurrency, and a
 * serial pass gives an honest per-catalog progress reading and fails on the
 * first problem instead of leaving several transactions in flight.
 *
 * The tier's version is written LAST, only once every catalog in it has
 * swapped, so an interrupted sync re-runs on next load rather than being
 * falsely marked current. Tier 1 writes `INSTALLED_VERSION_KEY` — the key the
 * gate blocks on; tier 2 writes its own, which nothing blocks on.
 */
export async function syncTier(tier: Tier, manifest: Manifest, options: SyncOptions = {}): Promise<void> {
  const resolved = resolveOptions(options);
  const entries = manifest.catalogs.filter((entry) => entry.tier === tier);
  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);

  let completed = 0;
  let bytes = 0;

  for (const entry of entries) {
    await seedCatalog(entry, resolved);
    completed += 1;
    bytes += entry.bytes;
    resolved.onProgress?.({ tier, completed, total: entries.length, bytes, totalBytes, catalogId: entry.id });
  }

  await resolved.db.dnd_meta.put({ key: versionKeyFor(tier), value: manifest.version });
}

/**
 * Whether a tier finished at this manifest version. Tier 1 additionally checks
 * that its tables hold rows — see `isCatalogInstalled`, which is what the gate
 * actually calls. This is the cheaper question tier 2 asks before starting.
 */
export async function isTierInstalled(tier: Tier, manifest: Manifest, db: SheetcraftDb = getDb()): Promise<boolean> {
  if (tier === 1) {
    return isCatalogInstalled(manifest, db);
  }
  const row = await db.dnd_meta.get(TIER_2_VERSION_KEY);
  return row?.value === manifest.version;
}

type FetchJsonOptions = {
  fetch: SyncFetch;
  signal?: AbortSignal;
  cache: RequestCache;
  catalogId: CatalogId | null;
};

/** Fetches JSON, mapping every failure mode onto a classified `SyncError`. */
async function fetchJson(url: string, { fetch, signal, cache, catalogId }: FetchJsonOptions): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { cache, signal });
  } catch (cause) {
    throw new SyncError("offline", `Could not reach ${url}.`, { catalogId, cause });
  }

  if (!response.ok) {
    throw new SyncError("http", `${url} responded ${response.status}.`, { catalogId });
  }

  try {
    return await response.json();
  } catch (cause) {
    throw new SyncError("malformed", `${url} was not valid JSON.`, { catalogId, cause });
  }
}

/**
 * A failed write is a quota problem or it isn't — and a quota problem does not
 * arrive flat. Dexie re-wraps the DOM error as its own `QuotaExceededError`
 * with the original on `inner`, and a `bulkPut` that hits the limit surfaces a
 * `BulkError` whose per-row `failures` hold it. A bare `error.name` check
 * therefore misses the case the distinct message exists for.
 *
 * Matched by `name` rather than `instanceof DOMException` because the Dexie
 * wrapper is not a `DOMException`, and only the name survives every path.
 */
function isQuotaError(cause: unknown, depth = 0): boolean {
  // Both nestings are one level deep in practice; the bound is a cycle guard.
  if (depth > 4 || typeof cause !== "object" || cause === null) {
    return false;
  }

  const error = cause as { name?: unknown; inner?: unknown; failures?: unknown };
  if (error.name === "QuotaExceededError") {
    return true;
  }
  if (isQuotaError(error.inner, depth + 1)) {
    return true;
  }
  return Array.isArray(error.failures) && error.failures.some((failure) => isQuotaError(failure, depth + 1));
}

function writeKind(cause: unknown): SyncErrorKind {
  return isQuotaError(cause) ? "quota" : "write";
}
