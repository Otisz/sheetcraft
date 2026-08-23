import { Share, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDurability } from "@/features/dnd/backup/queries";

/**
 * The install nudge, and the timing that is the whole point of it.
 *
 * **Installing does not copy IndexedDB — only cookies.** A user who builds
 * characters in a Safari tab and then installs lands in an *empty app*: their
 * sheets appear destroyed by the very act meant to protect them. So the nudge
 * fires **before any character exists**, when there is nothing to lose, and
 * export/import is the only route across that boundary afterwards.
 *
 * That inverts the obvious timing. Prompting after a character is created is
 * the worst case, not the best one. See CONTEXT.md § Installed.
 */

/** Dismissal is per-session: `sessionStorage`, so it never becomes permanent. */
const DISMISSED_KEY = "sheetcraft.installNudgeDismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Private mode, or storage denied. A nudge shown once too often is a far
    // smaller failure than one suppressed by an exception.
    return false;
  }
}

function rememberDismissed(): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // See above — dismissal that does not persist is survivable.
  }
}

export function InstallNudge({ characterCount }: { characterCount: number }) {
  const durability = useDurability();
  const [dismissed, setDismissed] = useState(readDismissed);

  // Never when already standalone — there is nothing to install — and never
  // once characters exist, because by then installing would strand them.
  if (dismissed || !durability.data || durability.data.installed || characterCount > 0) {
    return null;
  }

  return (
    <aside className="relative flex flex-col gap-2 rounded-xl border border-border bg-card p-4 pr-12 text-sm">
      <p className="font-medium">Add Sheetcraft to your Home Screen first</p>
      <p className="text-muted-foreground">
        Characters made in this tab won't carry over later — installing doesn't copy them. Tap{" "}
        <Share className="inline size-4 align-text-bottom" /> Share, then <strong>Add to Home Screen</strong>.
      </p>
      <Button
        variant="ghost"
        size="icon-lg"
        className="absolute top-2 right-2"
        aria-label="Dismiss"
        onClick={() => {
          rememberDismissed();
          setDismissed(true);
        }}
      >
        <X />
      </Button>
    </aside>
  );
}

/**
 * The other side of the migration trap: standalone, empty, and never exported.
 *
 * This is somebody who installed *after* building characters in a tab and is
 * now looking at an empty app. The data is still in Safari, and this is the
 * only route to it — which is why export is a prerequisite for installing
 * rather than a companion to it.
 */
export function MigrationRecovery({ characterCount }: { characterCount: number }) {
  const durability = useDurability();

  if (!durability.data?.installed || characterCount > 0 || durability.data.age.state !== "never") {
    return null;
  }

  return (
    <aside className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm">
      <p className="font-medium">Made characters in Safari?</p>
      <p className="text-muted-foreground">
        Installing to the Home Screen doesn't copy them across. Open Sheetcraft in Safari, back up there, then restore
        the file here.
      </p>
    </aside>
  );
}
