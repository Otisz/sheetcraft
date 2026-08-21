import { createDb, type SheetcraftDb } from "@/features/dnd/db/db";

/**
 * A uniquely-named database per test, constructed exactly as production
 * constructs it — `fake-indexeddb/auto` is installed globally by
 * `src/test/setup.ts`, so no IDBFactory is injected here. See ADR-0002.
 */
export function createTestDb(prefix: string): SheetcraftDb {
  return createDb(`${prefix}-${crypto.randomUUID()}`);
}

/** Closes and drops a test database. Safe to call on one that never opened. */
export async function destroyTestDb(db: SheetcraftDb | undefined): Promise<void> {
  if (!db) {
    return;
  }
  db.close();
  await db.delete();
}
