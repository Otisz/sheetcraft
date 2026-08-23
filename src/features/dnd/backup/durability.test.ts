import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backupAge,
  isStandalone,
  LAST_EXPORTED_KEY,
  needsBackupWarning,
  readLastExportedAt,
  recordExport,
  requestPersistence,
  STALE_AFTER_DAYS,
} from "@/features/dnd/backup/durability";
import type { SheetcraftDb } from "@/features/dnd/db/db";
import { createTestDb, destroyTestDb } from "@/test/db";

let db: SheetcraftDb;

beforeEach(() => {
  db = createTestDb("backup-durability");
});

afterEach(async () => {
  await destroyTestDb(db);
});

const NOW = new Date("2026-08-23T12:00:00.000Z");

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("backupAge", () => {
  it("reports never when nothing has been exported", () => {
    expect(backupAge(null, NOW)).toEqual({ state: "never" });
  });

  it("reports the whole days since the last export", () => {
    expect(backupAge(daysBefore(3), NOW)).toEqual({ state: "fresh", days: 3 });
  });

  it("counts today's export as zero days rather than rounding up", () => {
    expect(backupAge(new Date(NOW.getTime() - 60_000), NOW)).toEqual({ state: "fresh", days: 0 });
  });

  it("goes stale at the 7-day mark, which mirrors WebKit's own clock", () => {
    expect(backupAge(daysBefore(STALE_AFTER_DAYS - 1), NOW).state).toBe("fresh");
    // At exactly the window, not a day after it: the warning has to arrive
    // before the deletion it warns about, not with it.
    expect(backupAge(daysBefore(STALE_AFTER_DAYS), NOW)).toEqual({ state: "stale", days: 7 });
    expect(backupAge(daysBefore(STALE_AFTER_DAYS + 1), NOW)).toEqual({ state: "stale", days: 8 });
  });

  it("treats a future timestamp as fresh rather than as a negative age", () => {
    expect(backupAge(new Date(NOW.getTime() + 86_400_000), NOW)).toEqual({ state: "fresh", days: 0 });
  });
});

describe("last exported", () => {
  it("reads null before anything is exported", async () => {
    expect(await readLastExportedAt(db)).toBeNull();
  });

  it("round-trips through dnd_meta", async () => {
    await recordExport(NOW, db);

    expect(await readLastExportedAt(db)).toEqual(NOW);
    expect((await db.dnd_meta.get(LAST_EXPORTED_KEY))?.value).toBe(NOW.toISOString());
  });

  it("reads null rather than an Invalid Date from a corrupted row", async () => {
    await db.dnd_meta.put({ key: LAST_EXPORTED_KEY, value: "not a date" });

    expect(await readLastExportedAt(db)).toBeNull();
  });
});

describe("isStandalone", () => {
  it("is true in display-mode: standalone", () => {
    expect(isStandalone({ matchMedia: () => ({ matches: true }) })).toBe(true);
  });

  it("falls back to navigator.standalone for older iOS", () => {
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigatorStandalone: true })).toBe(true);
  });

  it("is false in a tab", () => {
    expect(isStandalone({ matchMedia: () => ({ matches: false }) })).toBe(false);
  });

  it("is false where matchMedia does not exist at all", () => {
    expect(isStandalone({})).toBe(false);
  });
});

describe("requestPersistence", () => {
  it("asks, and reports what it got", async () => {
    const persist = vi.fn(() => Promise.resolve(true));

    expect(await requestPersistence({ persist })).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("swallows a rejection — a false answer is normal on iOS and not actionable", async () => {
    expect(await requestPersistence({ persist: () => Promise.reject(new Error("nope")) })).toBe(false);
  });

  it("is false where the API does not exist", async () => {
    expect(await requestPersistence({})).toBe(false);
  });
});

describe("needsBackupWarning", () => {
  const stale = backupAge(daysBefore(10), NOW);
  const fresh = backupAge(daysBefore(1), NOW);

  it("stays quiet when there is nothing to lose", () => {
    expect(needsBackupWarning(stale, null, null)).toBe(false);
  });

  it("stays quiet while the backup is fresh", () => {
    expect(needsBackupWarning(fresh, NOW, daysBefore(1))).toBe(false);
  });

  it("stays quiet when the stale backup already contains every change", () => {
    // Edited nine days ago, backed up eight days ago: old, but nothing is
    // missing from the file. A warning here is the one users learn to ignore.
    expect(needsBackupWarning(stale, daysBefore(9), daysBefore(8))).toBe(false);
  });

  it("warns when a change came after the last backup", () => {
    expect(needsBackupWarning(stale, daysBefore(2), daysBefore(8))).toBe(true);
  });

  it("warns when there is a character and no backup at all", () => {
    expect(needsBackupWarning(backupAge(null, NOW), daysBefore(1), null)).toBe(true);
  });
});
