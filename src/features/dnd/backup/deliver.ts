/**
 * Getting the backup file off the device: Web Share first, `<a download>` as
 * the fallback. Both routes are always available and a failure is never silent.
 *
 * **The whole module exists to protect one rule: serialise before the tap
 * handler awaits anything.** Web Share requires transient activation (spec step
 * 6), and an `await` on IndexedDB before `share()` consumes it — the call then
 * rejects with `NotAllowedError` and the user gets nothing. That rule is
 * enforced by the SHAPE of this API rather than by a comment: `deliverBackup`
 * takes an already-built `File`, so there is nowhere inside it to await
 * storage. The caller builds the file with `backupFile` from data it already
 * has, and `useBackupExport` keeps that data warm for exactly this reason.
 */

/** What happened, so the caller can say something true afterwards. */
export type DeliveryOutcome =
  /** Handed to the share sheet; where it went is the OS's business. */
  | "shared"
  /** The user dismissed the share sheet. Say nothing. */
  | "cancelled"
  /** Written via an anchor — the fallback, and the only route on desktop. */
  | "downloaded";

/**
 * Every browser capability the delivery path touches, injected.
 *
 * Not because the DOM is hard to reach, but because the four rules below are
 * behavioural — probe before share, `AbortError` means cancel, never download
 * behind a successful share, revoke late — and each one is a bug that only
 * shows up on a phone. Behind this seam they are ordinary assertions.
 */
export type DeliveryEnvironment = {
  canShare: (data: { files: File[] }) => boolean;
  share: (data: { files: File[] }) => Promise<void>;
  createObjectURL: (file: File) => string;
  revokeObjectURL: (url: string) => void;
  createAnchor: () => { href: string; download: string; click: () => void };
  /** Deferred, not immediate — see `REVOKE_DELAY_MS`. */
  scheduleRevoke: (revoke: () => void) => void;
};

/**
 * Late enough that the download has certainly started. An immediate revoke
 * after `click()` can cancel it outright, and the failure is silent: the tap
 * appears to do nothing at all.
 */
const REVOKE_DELAY_MS = 10_000;

/**
 * The real browser. Reads `window`/`document` lazily inside each function, so
 * importing this module on the server is safe — `/dnd` routes are `ssr: false`
 * for rendering only, and their modules still evaluate there.
 */
export function browserDelivery(): DeliveryEnvironment {
  return {
    // `canShare` is optional and only some browsers implement the files check,
    // so its absence means "cannot", not "assume yes".
    canShare: (data) => navigator.canShare?.(data) ?? false,
    share: (data) => navigator.share(data),
    createObjectURL: (file) => URL.createObjectURL(file),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement("a"),
    scheduleRevoke: (revoke) => {
      setTimeout(revoke, REVOKE_DELAY_MS);
    },
  };
}

/**
 * The backup as a `File`, built **synchronously**. Call this before awaiting
 * anything, in the tap handler itself.
 *
 * `application/json` rather than a download-forcing `application/octet-stream`:
 * the widely-repeated claim that iOS refuses to share `.json` is not supported
 * by WebKit's source — `Navigator::canShare` checks only that the files array
 * is non-empty and the feature flag is on. There is no file-type allowlist.
 */
export function backupFile(data: unknown, filename: string): File {
  return new File([JSON.stringify(data, null, 2)], filename, { type: "application/json" });
}

/**
 * Hands the file to the platform.
 *
 * A **successful share is the end of it** — falling through to a download
 * afterwards would leave two copies of one backup for the user to reconcile.
 * A rejected share falls back, except for `AbortError`, which is the user
 * closing the share sheet: they made a choice, and answering it with an
 * unrequested download overrides it.
 */
export async function deliverBackup(
  file: File,
  environment: DeliveryEnvironment = browserDelivery(),
): Promise<DeliveryOutcome> {
  const data = { files: [file] };

  if (environment.canShare(data)) {
    try {
      await environment.share(data);
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return "cancelled";
      }
      // Anything else — no share target, a platform that advertised more than
      // it does — falls through, because the user still wants their file.
    }
  }

  return download(file, environment);
}

/**
 * `<a download>` has worked on iOS since 13 (WebKit bug 167341, r240530); the
 * old "iOS ignores download" advice is stale.
 */
function download(file: File, environment: DeliveryEnvironment): DeliveryOutcome {
  const url = environment.createObjectURL(file);
  const anchor = environment.createAnchor();

  anchor.href = url;
  anchor.download = file.name;
  anchor.click();

  environment.scheduleRevoke(() => environment.revokeObjectURL(url));
  return "downloaded";
}
