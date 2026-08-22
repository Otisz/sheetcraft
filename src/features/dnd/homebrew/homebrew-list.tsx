import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHomebrewLibrary } from "@/features/dnd/homebrew/queries";
import type { HomebrewGroup } from "@/features/dnd/homebrew/repository";
import { HOMEBREW_TYPES } from "@/features/dnd/homebrew/types";
import { THUMB_ACTION } from "@/lib/utils";

/**
 * `/dnd/homebrew` — everything the user has written, grouped by type.
 *
 * Empty groups are shown, not hidden: the list's job is to say what CAN be
 * authored, and a page showing only what already exists opens blank and
 * explains nothing.
 */

export function HomebrewList() {
  const library = useHomebrewLibrary();

  if (library.isPending) {
    return <Pending />;
  }

  if (library.isError) {
    return <Failed onRetry={() => void library.refetch()} />;
  }

  const groups = library.data;
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="flex flex-col gap-1 px-4 pt-6 pb-4">
        <Link to="/dnd" className="flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="size-4" />
          Characters
        </Link>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">Homebrew</h1>
          {total > 0 ? <p className="text-sm text-muted-foreground">{total}</p> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Your own content, using the same shape as the SRD — so it works everywhere SRD content does.
        </p>
      </header>

      <div className="flex flex-col gap-6 px-4 pb-16">
        {groups.map((group) => (
          <TypeGroup key={group.type} group={group} />
        ))}
      </div>
    </div>
  );
}

/**
 * One type's heading, its entries, and the action that adds another. The
 * action sits under the group rather than in a global "new" button: the type
 * is the first thing a new entry needs, and picking it from a list of seven
 * beats picking it from a drawer after the fact.
 */
function TypeGroup({ group }: { group: HomebrewGroup }) {
  const spec = HOMEBREW_TYPES[group.type];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{group.plural}</h2>
        {spec.tier === "json" ? <TierNote>JSON only</TierNote> : null}
        {spec.tier === "minimal-form" ? <TierNote>Short form</TierNote> : null}
      </div>

      {group.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {group.entries.map((entry) => (
            <li key={entry.index}>
              <Link
                to="/dnd/homebrew/$type/$index"
                params={{ type: group.type, index: entry.index }}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:bg-muted"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{nameOf(entry.name, entry.index)}</span>
                  <span className="truncate text-sm text-muted-foreground">homebrew:{entry.index}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Button
        render={<Link to="/dnd/homebrew/new/$type" params={{ type: group.type }} />}
        nativeButton={false}
        variant="outline"
        size="lg"
        className={THUMB_ACTION}
      >
        <Plus />
        New {spec.label.toLowerCase()}
      </Button>
    </section>
  );
}

/**
 * Which surface a type gets, said on the list rather than discovered on the
 * form. Someone tapping "New class" and landing in a JSON editor without
 * warning concludes the form failed to load.
 */
function TierNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

/** Falls back to the index: an entry saved without a name is still identifiable. */
function nameOf(name: unknown, index: string): string {
  return typeof name === "string" && name !== "" ? name : index;
}

function Pending() {
  return (
    <output aria-live="polite" className="flex min-h-dvh items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">Loading your homebrew…</p>
    </output>
  );
}

function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium">Your homebrew could not be read.</p>
      <p className="max-w-prose text-sm text-muted-foreground">
        The storage on this device did not answer. Nothing has been lost.
      </p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}
