// Installs a fake IndexedDB on globalThis so Dexie can be constructed exactly as
// production constructs it — no explicit IDBFactory injection. See ADR-0002.
import "fake-indexeddb/auto";
