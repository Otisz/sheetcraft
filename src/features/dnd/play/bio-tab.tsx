import type { CharacterRecord } from "@/features/dnd/db/schema";
import { nameFor } from "@/features/dnd/play/format";
import { groupProficiencies } from "@/features/dnd/play/sections";
import type { TabData } from "@/features/dnd/play/tab-data";

/**
 * The Bio tab: proficiencies by kind, background, alignment, notes — and the
 * record's bookkeeping at the foot.
 *
 * This is the tab that catches everything with nowhere else to be, which is
 * exactly why it exists: the six-tab set came from auditing the record for
 * homeless fields, and a field with no home is a field the player cannot reach.
 * See `tabs.ts`, whose map is asserted against the record's own keys.
 */
export function BioTab({
  character,
  names,
  onNotesChange,
}: {
  character: CharacterRecord;
  names: TabData["names"];
  onNotesChange: (notes: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Background character={character} names={names} />
      <Proficiencies character={character} names={names} />
      <Notes notes={character.play.notes} onNotesChange={onNotesChange} />
      <Bookkeeping character={character} />
    </div>
  );
}

function Background({ character, names }: { character: CharacterRecord; names: TabData["names"] }) {
  return (
    <section aria-label="Background and alignment" className="flex flex-col gap-1.5">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Background</h2>
      <dl className="flex flex-col gap-1.5">
        <Field
          label="Background"
          // A null ref is "not chosen", which is different from a ref that
          // failed to resolve — the second gets the ⚠ marker, the first does not.
          value={character.backgroundRef === null ? "Not chosen" : nameFor(names, character.backgroundRef)}
        />
        <Field label="Alignment" value={character.alignment ?? "Not chosen"} />
      </dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

/**
 * Proficiencies, grouped by kind.
 *
 * An empty kind keeps its heading rather than disappearing: "Tools — none" is
 * information, while a missing heading is a question. Saving throws are absent
 * here on purpose — they head the Skills tab, beside the numbers they move.
 */
function Proficiencies({ character, names }: { character: CharacterRecord; names: TabData["names"] }) {
  return (
    <section aria-label="Proficiencies" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Proficiencies</h2>

      {groupProficiencies(character).map((group) => (
        <div key={group.kind} className="rounded-lg border bg-card px-3 py-2">
          <h3 className="text-xs font-medium text-muted-foreground">{group.label}</h3>
          {group.entries.length === 0 ? (
            <p className="mt-0.5 text-sm text-muted-foreground">None</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1">
              {group.entries.map((entry) => (
                <li key={entry.ref} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {nameFor(names, entry.ref)}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

/**
 * Free-text notes — the one place on the sheet a player types prose.
 *
 * Written on blur rather than on every keystroke: each write is a Dexie `put`
 * of the whole record, and a put per character is a lot of writing for a field
 * nobody reads back mid-sentence.
 */
function Notes({ notes, onNotesChange }: { notes: string; onNotesChange: (notes: string) => void }) {
  return (
    <section className="flex flex-col gap-2">
      <label htmlFor="notes" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Notes
      </label>
      <textarea
        id="notes"
        defaultValue={notes}
        rows={5}
        placeholder="Anything worth remembering between sessions."
        onBlur={(event) => onNotesChange(event.target.value)}
        className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </section>
  );
}

/**
 * The record's own bookkeeping. Shown rather than hidden because every field in
 * the record must be reachable — and because "when did I last touch this
 * character" is the question a player asks of a list of six.
 */
function Bookkeeping({ character }: { character: CharacterRecord }) {
  return (
    <section aria-label="Record details" className="flex flex-col gap-1 pt-2 text-xs text-muted-foreground">
      <p>Created {character.createdAt.toLocaleDateString()}</p>
      <p>Last changed {character.updatedAt.toLocaleDateString()}</p>
      <p className="font-mono break-all">
        {character.id} · schema v{character.schemaVersion}
      </p>
    </section>
  );
}
