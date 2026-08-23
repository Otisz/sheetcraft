import type { SheetcraftDb } from "@/features/dnd/db/db";
import { getDb } from "@/features/dnd/db/db";

/**
 * What the durability panel knows: whether the app is installed, and how old
 * the last backup is.
 *
 * The two are not interchangeable, and the messaging must never imply they
 * are. **Installing** is the only documented exemption from WebKit's 7-day
 * deletion of script-writable storage — but it is iOS-only, does nothing about
 * a user clearing site data, and does nothing about a lost device.
 * **Exporting** covers all three. See CONTEXT.md § Installed and § Backup file.
 */

/** The `dnd_meta` key the last export's timestamp lives under. */
export const LAST_EXPORTED_KEY = "lastExportedAt";

/**
 * Mirrors WebKit's own clock: a backup older than this is older than the
 * window in which the browser may delete everything without warning.
 */
export const STALE_AFTER_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How old the last backup is.
 *
 * `never` is its own state rather than an infinite age, because it is a
 * different sentence to the user — "you have no backup" and "your backup is
 * old" call for different copy, and a `days: Infinity` would have to be
 * special-cased at every rendering site to say so.
 */
export type BackupAge = { state: "never" } | { state: "fresh" | "stale"; days: number };

export function backupAge(lastExportedAt: Date | null, now: Date = new Date()): BackupAge {
  if (lastExportedAt === null) {
    return { state: "never" };
  }

  // Floored, and clamped at zero: a clock that moved backwards — a timezone
  // change, a device with the wrong date — must not produce a backup aged -3
  // days, which reads as nonsense in a panel whose whole job is to be trusted.
  const days = Math.max(0, Math.floor((now.getTime() - lastExportedAt.getTime()) / MS_PER_DAY));

  return { state: days > STALE_AFTER_DAYS ? "stale" : "fresh", days };
}

/**
 * The last export's timestamp, or `null` when there has never been one.
 *
 * A row that cannot be read as a date reads as `null` rather than as an
 * `Invalid Date`: the panel would render "NaN days ago", and the honest
 * statement about a corrupted timestamp is that there is no backup we can
 * vouch for.
 */
export async function readLastExportedAt(db: SheetcraftDb = getDb()): Promise<Date | null> {
  const row = await db.dnd_meta.get(LAST_EXPORTED_KEY);
  if (typeof row?.value !== "string") {
    return null;
  }

  const parsed = new Date(row.value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Stamps an export. An ISO string rather than a `Date`, so the row survives any
 * future serialisation of `dnd_meta` unchanged.
 */
export async function recordExport(at: Date = new Date(), db: SheetcraftDb = getDb()): Promise<void> {
  await db.dnd_meta.put({ key: LAST_EXPORTED_KEY, value: at.toISOString() });
}

/** The display-mode capabilities, injected so the two detection paths are testable. */
export type DisplayEnvironment = {
  matchMedia?: (query: string) => { matches: boolean };
  /** iOS-only, and non-standard. Present as a fallback for very old versions. */
  navigatorStandalone?: boolean;
};

export function browserDisplay(): DisplayEnvironment {
  return {
    matchMedia: typeof window === "undefined" ? undefined : (query) => window.matchMedia(query),
    navigatorStandalone: (navigator as { standalone?: boolean }).standalone,
  };
}

/**
 * Whether the app is running from the Home Screen.
 *
 * `matchMedia('(display-mode: standalone)')` is Baseline since Jan 2020 and
 * correct on current iOS; `navigator.standalone` is only the `||` for very old
 * versions. Absent both — the server, where these routes' modules still
 * evaluate — the answer is `false`, which is the safe direction: it shows the
 * install nudge to somebody who does not need it rather than hiding the one
 * durability measure from somebody who does.
 */
export function isStandalone(environment: DisplayEnvironment = browserDisplay()): boolean {
  return (
    environment.matchMedia?.("(display-mode: standalone)").matches === true || environment.navigatorStandalone === true
  );
}

export type PersistenceEnvironment = {
  persist?: () => Promise<boolean>;
};

export function browserPersistence(): PersistenceEnvironment {
  return { persist: () => navigator.storage?.persist() };
}

/**
 * Asks for persistent storage, opportunistically.
 *
 * **The result is never surfaced.** A `false` return is normal on iOS Safari in
 * a tab and is not actionable by the user — showing it would send somebody
 * chasing a setting they cannot change. It is also NOT the WebKit durability
 * mechanism: the exemption is keyed to Home Screen web app status, and WebKit
 * names being installed as a heuristic for *granting* persist(), not the
 * reverse. Any grant is a bonus, and it genuinely helps on Chromium.
 *
 * A rejection is swallowed for the same reason a `false` is: there is nothing
 * the caller could usefully do about it.
 */
export async function requestPersistence(environment: PersistenceEnvironment = browserPersistence()): Promise<boolean> {
  try {
    return (await environment.persist?.()) ?? false;
  } catch {
    return false;
  }
}
