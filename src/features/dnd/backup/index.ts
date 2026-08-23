/**
 * The backup feature's public surface — export, import, and the durability
 * state that decides what the user is told about either. Import from here, not
 * from the modules behind it; the split between collection, delivery and the
 * panel is free to move.
 *
 * This feature exists because WebKit deletes IndexedDB after 7 days of Safari
 * use without a tap on the site, and Sheetcraft has no server copy. It is a
 * data-loss defence, not a feature. See CONTEXT.md § Backup file.
 */

export { BackupPanel, ExportButton } from "@/features/dnd/backup/backup-panel";
export { collectBackup } from "@/features/dnd/backup/collect";
export type { DeliveryEnvironment, DeliveryOutcome } from "@/features/dnd/backup/deliver";
export { backupFile, deliverBackup } from "@/features/dnd/backup/deliver";
export type { BackupAge } from "@/features/dnd/backup/durability";
export {
  backupAge,
  isStandalone,
  LAST_EXPORTED_KEY,
  readLastExportedAt,
  recordExport,
  requestPersistence,
  STALE_AFTER_DAYS,
} from "@/features/dnd/backup/durability";
export type { BackupFile, BackupHomebrew } from "@/features/dnd/backup/format";
export { BACKUP_FORMAT, backupFilename, FORMAT_VERSION } from "@/features/dnd/backup/format";
export type { ImportSummary } from "@/features/dnd/backup/import";
export { importBackup } from "@/features/dnd/backup/import";
export { InstallNudge, MigrationRecovery } from "@/features/dnd/backup/install-nudge";
export type { ParseFailure, ParseResult } from "@/features/dnd/backup/parse";
export { parseBackup } from "@/features/dnd/backup/parse";
export type { DurabilityState } from "@/features/dnd/backup/queries";
export {
  backupKeys,
  useDurability,
  useExportBackup,
  useImportBackup,
  useReadBackupFile,
} from "@/features/dnd/backup/queries";
export { StaleBackupBanner } from "@/features/dnd/backup/stale-banner";
