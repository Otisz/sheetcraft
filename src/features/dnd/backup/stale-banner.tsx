import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/features/dnd/backup/backup-panel";
import { useDurability } from "@/features/dnd/backup/queries";

/**
 * The stale-backup banner: shown when the last backup is older than WebKit's
 * own 7-day clock **and there is unbacked-up work to lose**.
 *
 * Tied to a real change rather than fired every session. A prompt users learn
 * to dismiss on sight is worse than one that arrives when something is
 * actually at stake — and the second condition is what makes the difference:
 * an old backup of data that has not moved since is not a risk.
 */

export function StaleBackupBanner({ lastChangeAt }: { lastChangeAt: Date | null }) {
  const durability = useDurability();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !durability.data || lastChangeAt === null) {
    return null;
  }

  const { age } = durability.data;

  // `never` counts as stale the moment anything exists to lose: a user who has
  // made characters and has no backup at all is the case this whole feature
  // exists for.
  if (age.state === "fresh") {
    return null;
  }

  return (
    <aside role="status" className="flex flex-col gap-3 rounded-xl border border-amber-500/50 bg-card p-4">
      <p className="flex items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
        <span>
          {age.state === "never"
            ? "You have no backup. Your browser can delete this data without warning."
            : `Last backup ${age.days} days ago — your browser can delete this data without warning.`}
        </span>
      </p>
      <div className="flex flex-col gap-2">
        <ExportButton label="Back up now" />
        <Button variant="ghost" size="lg" className="h-11 w-full" onClick={() => setDismissed(true)}>
          Later
        </Button>
      </div>
    </aside>
  );
}
