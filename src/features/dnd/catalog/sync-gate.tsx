import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Manifest } from "@/features/dnd/catalog/manifest";
import type { SyncFetch, SyncProgress } from "@/features/dnd/catalog/sync";
import { fetchManifest, isCatalogInstalled, isTierInstalled, SyncError, syncTier } from "@/features/dnd/catalog/sync";
import type { SheetcraftDb } from "@/features/dnd/db/db";

/**
 * The sync gate: the provider on the `/dnd` layout that blocks first paint
 * until tier 1 is installed. Not a route loader — loaders are per-match,
 * SWR-cached, re-run on navigation, and non-blocking past ~1000ms.
 * See CONTEXT.md § Sync gate.
 *
 * All the logic worth testing lives in `sync.ts`, behind a stubbed fetch. This
 * file is the wiring and the two failure surfaces: a blocking inline retry for
 * tier 1, and a dismissible banner for tier 2.
 */

/** Where the blocking half of the gate has got to. */
type GateStatus =
  /** Checking the manifest against what Dexie records as installed. */
  | { phase: "checking" }
  /** Tier 1 is downloading. Blocking. */
  | { phase: "syncing"; progress: SyncProgress | null }
  /** Tier 1 is installed; children render. */
  | { phase: "ready" }
  /** Tier 1 failed. Blocking, with a retry. */
  | { phase: "failed"; error: SyncError };

export type CatalogSyncState = {
  status: GateStatus;
  /** A tier-2 failure, if one is outstanding and undismissed. */
  backgroundError: SyncError | null;
  /** Re-runs the whole gate. The blocking failure's escape hatch. */
  retry: () => void;
  /** Re-runs tier 2 alone, leaving the installed tier 1 alone. */
  retryBackground: () => void;
  dismissBackgroundError: () => void;
};

const CatalogSyncContext = createContext<CatalogSyncState | null>(null);

/** Reads the gate's state. Throws outside the provider — that is a wiring bug. */
export function useCatalogSync(): CatalogSyncState {
  const state = useContext(CatalogSyncContext);
  if (!state) {
    throw new Error("useCatalogSync must be used inside <CatalogSyncProvider>");
  }
  return state;
}

export type CatalogSyncProviderProps = {
  children: React.ReactNode;
  /** Injected in tests; production takes the defaults from `sync.ts`. */
  db?: SheetcraftDb;
  fetch?: SyncFetch;
};

export function CatalogSyncProvider({ children, db, fetch }: CatalogSyncProviderProps) {
  const [status, setStatus] = useState<GateStatus>({ phase: "checking" });
  const [backgroundError, setBackgroundError] = useState<SyncError | null>(null);

  /**
   * Which pass is current. Both the mount effect and an explicit retry call
   * the same `run`, so cancellation cannot ride on the effect's closure —
   * a stale pass compares its own token against this and stays silent.
   */
  const passRef = useRef(0);
  /** Aborts whatever the retired pass still has in flight. */
  const abortRef = useRef<AbortController | null>(null);
  /** Tier 2 is fire-and-forget; this keeps two passes from starting it twice. */
  const tier2Started = useRef(false);
  /** Held so the banner's retry re-runs tier 2 without re-fetching the manifest. */
  const manifestRef = useRef<Manifest | null>(null);

  const startTier2 = useCallback(
    (manifest: Manifest, pass: number, signal?: AbortSignal) => {
      if (tier2Started.current) {
        return;
      }
      tier2Started.current = true;

      // Skip the 186 KB entirely when tier 2 already finished at this version.
      isTierInstalled(2, manifest, db)
        .then((installed) => (installed ? undefined : syncTier(2, manifest, { db, fetch, signal })))
        .catch((cause: unknown) => {
          if (passRef.current !== pass) {
            return;
          }
          // A tier-2 failure never blocks — the app stays usable with whatever
          // installed, and the banner exists so the gap is not invisible until
          // someone hits a half-populated picker.
          tier2Started.current = false;
          setBackgroundError(asSyncError(cause));
        });
    },
    [db, fetch],
  );

  const run = useCallback(async () => {
    const pass = passRef.current + 1;
    passRef.current = pass;
    const current = () => passRef.current === pass;

    // Retire the previous pass's requests rather than letting them run to
    // completion unwatched.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setStatus({ phase: "checking" });
    setBackgroundError(null);

    try {
      const manifest = await fetchManifest({ fetch, signal });
      manifestRef.current = manifest;

      // Matching version and populated tier 1 — no gate at all.
      const installed = await isCatalogInstalled(manifest, db);
      if (!current()) {
        return;
      }

      if (!installed) {
        setStatus({ phase: "syncing", progress: null });
        await syncTier(1, manifest, {
          db,
          fetch,
          signal,
          onProgress: (progress) => {
            if (current()) {
              setStatus({ phase: "syncing", progress });
            }
          },
        });
        if (!current()) {
          return;
        }
      }

      setStatus({ phase: "ready" });
      // Deliberately not awaited: nothing ever waits on tier 2.
      startTier2(manifest, pass, signal);
    } catch (cause) {
      if (current()) {
        setStatus({ phase: "failed", error: asSyncError(cause) });
      }
    }
  }, [db, fetch, startTier2]);

  useEffect(() => {
    void run();

    // Bumping the pass on unmount retires whatever is still in flight, so a
    // late resolution cannot set state on a gate nobody is looking at.
    return () => {
      passRef.current += 1;
      abortRef.current?.abort();
    };
  }, [run]);

  const retry = useCallback(() => {
    tier2Started.current = false;
    void run();
  }, [run]);

  const dismissBackgroundError = useCallback(() => setBackgroundError(null), []);

  const retryBackground = useCallback(() => {
    const manifest = manifestRef.current;
    if (!manifest) {
      return;
    }
    setBackgroundError(null);
    startTier2(manifest, passRef.current, abortRef.current?.signal);
  }, [startTier2]);

  if (status.phase === "failed") {
    return <SyncFailed error={status.error} onRetry={retry} />;
  }

  if (status.phase === "checking" || status.phase === "syncing") {
    return <SyncPending progress={status.phase === "syncing" ? status.progress : null} />;
  }

  return (
    <CatalogSyncContext.Provider value={{ status, backgroundError, retry, retryBackground, dismissBackgroundError }}>
      {backgroundError ? (
        <BackgroundErrorBanner error={backgroundError} onRetry={retryBackground} onDismiss={dismissBackgroundError} />
      ) : null}
      {children}
    </CatalogSyncContext.Provider>
  );
}

/** Anything thrown that is not already classified is a write failure. */
function asSyncError(cause: unknown): SyncError {
  return cause instanceof SyncError ? cause : new SyncError("write", "The catalog sync failed.", { cause });
}

/**
 * What a failure says. Quota gets its own wording because retrying genuinely
 * will not help, and a Retry button there would be a lie.
 */
export function syncErrorMessage(error: SyncError): string {
  switch (error.kind) {
    case "offline":
      return "Could not reach the game data. Check your connection and try again.";
    case "http":
      return error.catalogId
        ? `The "${error.catalogId}" game data is missing from the server.`
        : "The game data listing is missing from the server.";
    case "malformed":
      return error.catalogId
        ? `The "${error.catalogId}" game data could not be read. Your existing data is untouched.`
        : "The game data listing could not be read.";
    case "quota":
      return "There is no room left to store game data. Free up space on this device — retrying will not help.";
    case "write":
      return "The game data could not be stored on this device.";
  }
}

function SyncPending({ progress }: { progress: SyncProgress | null }) {
  const percent = progress ? Math.round((progress.bytes / progress.totalBytes) * 100) : 0;

  return (
    <output aria-live="polite" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8">
      <p className="text-lg font-medium">Getting the game data ready…</p>
      <div className="h-2 w-64 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">This happens once. It is quick, and then it works offline.</p>
    </output>
  );
}

/**
 * The blocking failure. It offers a retry, and — crucially — a way out: a
 * character whose catalogs are already installed must stay reachable, so this
 * is never a dead end.
 */
function SyncFailed({ error, onRetry }: { error: SyncError; onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium">The game data could not be installed.</p>
      <p className="max-w-prose text-sm text-muted-foreground">{syncErrorMessage(error)}</p>
      <div className="flex gap-2">
        {error.retryable ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
        ) : null}
        <a href="/" className="rounded-lg border border-border px-3 py-2 text-sm font-medium">
          Back to start
        </a>
      </div>
    </div>
  );
}

/**
 * The non-blocking failure. Persistent and dismissible, rather than a silent
 * retry, because the gap is otherwise invisible until someone hits a
 * half-populated picker and concludes the app is broken.
 */
function BackgroundErrorBanner({
  error,
  onRetry,
  onDismiss,
}: {
  error: SyncError;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div role="status" className="flex items-center justify-between gap-4 border-b border-border bg-muted px-4 py-2">
      <p className="text-sm">{syncErrorMessage(error)}</p>
      <div className="flex shrink-0 gap-3">
        {error.retryable ? (
          <button type="button" onClick={onRetry} className="text-sm font-medium underline">
            Retry
          </button>
        ) : null}
        <button type="button" onClick={onDismiss} className="text-sm font-medium underline">
          Dismiss
        </button>
      </div>
    </div>
  );
}
