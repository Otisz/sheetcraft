/**
 * The catalog feature's public surface. Import from here, not from the modules
 * behind it — the split between the manifest, the sync engine and the gate is
 * free to move. See CONTEXT.md § Catalog and § Sync gate.
 *
 * The vendored upstream schemas are deliberately *not* re-exported: they are
 * `scripts/vendor-srd.ts`'s and `sync.ts`'s business, and nothing above this
 * boundary should be validating raw upstream JSON.
 */

export type {
  CatalogId,
  Manifest,
  ManifestEntry,
  Tier,
} from "@/features/dnd/catalog/manifest";
export {
  CATALOGS,
  MANIFEST_PATH,
  MANIFEST_VERSION,
  TIER_1,
  tierOf,
  UPSTREAM_SHA,
} from "@/features/dnd/catalog/manifest";
export type { SyncErrorKind, SyncFetch, SyncOptions, SyncProgress } from "@/features/dnd/catalog/sync";
export {
  fetchManifest,
  INSTALLED_VERSION_KEY,
  isCatalogInstalled,
  readInstalledVersion,
  SyncError,
  seedCatalog,
  syncTier,
} from "@/features/dnd/catalog/sync";
export type { CatalogSyncProviderProps, CatalogSyncState } from "@/features/dnd/catalog/sync-gate";
export { CatalogSyncProvider, syncErrorMessage, useCatalogSync } from "@/features/dnd/catalog/sync-gate";
