# ADR-0006: Entry-authored modifier records live in a side-car beside the vendored payload

- **Status:** Accepted
- **Date:** 2026-08-23
- **Ticket:** [Modifier records on homebrew entries](https://github.com/Otisz/sheetcraft/issues/174)

## Context

CONTEXT.md § Homebrew authoring tiers has always described the subclass form as "level features as
prose **plus modifier records**". The prose shipped in
[#165](https://github.com/Otisz/sheetcraft/issues/165); the modifier records did not, and the seam
comment on `SubclassFields` recorded why:

- A `Modifier` was a field of the **character** record. Nothing read one off a catalog or homebrew
  row.
- Every authorable type validates against a **vendored catalog schema**, and those are
  `z.strictObject`. An entry carrying an extra `modifiers` key failed `validateEntry` outright.

So the field could not be added to the form without contradicting two other lines of the same
ticket — "entries conform to the same schema as catalog entries" and "schema-valid is valid". That
made it a schema change rather than a form change, which is why it became its own ticket.

## Decision

**A side-car: `modifiers` sits on the stored row, beside `updatedAt`, outside the vendored payload.**

`HomebrewEntry` was already `CatalogEntry & { updatedAt: Date }` — a row has always been "the
vendored payload, plus bookkeeping the schema never sees". This adds a second such key rather than
inventing a new kind of storage:

```ts
export type HomebrewEntry = CatalogEntry & {
  updatedAt: Date;
  modifiers?: unknown[];
};
```

`validateEntry` splits the row with `stripSideCar`, parses the payload against the untouched strict
schema, validates the side-car separately, and reattaches it. The strict schemas are not forked, not
loosened, and not extended — an entry with a genuinely unknown key still fails exactly as before.

### Why the placement is the whole decision

The ticket's three options differ only in where the records sit, and everything else follows:

| | vendored schema | catalog interchangeable | provenance |
|---|---|---|---|
| 1. Inside the payload | must be forked | no | split across two records |
| 2. Character-authored only | untouched | yes | one place |
| **3. Side-car** | **untouched** | **yes** | **one place** |

Option 1 was rejected for the reason the #165 seam comment already gave: it retires "entries conform
to the same schema as catalog entries", which is what lets `resolveRef` hand a catalog row and a
homebrew row to the same derivation code without either knowing which it got.

Option 2 — leave it on the character — is the status quo and remains **the right answer for a
one-off**. It is rejected as the *only* answer because it makes the author re-enter the same three
records on every character that takes the subclass, and the ninth time they do it one of them will
be wrong.

## What a catalog row does

Nothing. It has no side-car, `entryModifiersOf` reads an absent one as an empty list, and no code
path branches on where an entry came from. A character made entirely of SRD content carries exactly
the modifiers it carried before this ticket — asserted, not assumed.

## Which types get it

**All seven, in storage; `subclasses` alone in the form.**

The split is not a compromise, it is what the two halves actually cost. Storage, application and the
delete-block are type-agnostic — `syncAllEntryModifiers` walks `homebrewRefsOf`, the same traversal
the delete block uses, so a type contributes records by existing rather than by being listed
somewhere. A *form* is per-type work, and only `subclasses` has the ticket asking for one.

The other six reach the same field through the JSON editor, which is already the escape hatch that
makes "homebrew uses the same schema as catalog" honest. That is the existing tiering, not a new
exception.

## When they apply, and why that needed deciding

**At creation, and again on every edit of the entry.**

Everything else about a homebrew entry is read *through* the ref at derive time, so an edit
propagates for free — that is the live-edit behaviour CONTEXT.md § Catalog reference promises. A
modifier cannot work that way, for the reason ADR-0004 already gave about feature records:
`enabled` is stored player state, and a list rebuilt on every read has nowhere to keep the toggle.

So the records are **stored on the character** and have to be brought forward deliberately.
`saveHomebrewEntry` is where that happens, because it is the one place that knows an entry just
changed and it already scans for referencing characters to report the edit. The propagation reuses
that scan rather than walking the table a second time — two walks are two answers that can differ.

### The edit surface — since shipped

**Superseded by [ADR-0007](0007-equipment-and-spell-editing.md).**

This section originally recorded that `syncAllEntryModifiers` ran in `createCharacter` and nowhere
else, because nothing in the app changed a character's refs after creation, and named the trap that
would land the moment something did: a homebrew item acquired after creation contributing no records
until its entry was next saved.

[#176](https://github.com/Otisz/sheetcraft/issues/176) built that surface — the `⋯` → Equipment and
`⋯` → Spells drawers — and closed the trap rather than inheriting it. The sync is **not** a second
call the drawers make. `updateCharacterRefs` in the character repository applies the change and
re-syncs in one transaction, and it is the only production write path for either field, so there is
no caller that could forget.

One thing that ticket found which this one did not anticipate: **removal did not follow from
acquisition.** `mergeModifiers` drops only records belonging to a source it is given, and a dropped
item is precisely an entry the walk no longer visits — so its records would have outlived it.
`syncAllEntryModifiers` now sweeps entry-authored records no current ref justifies, scoped to the
`homebrew:<type>:<index>` grammar rather than the bare `homebrew:` prefix. The distinction matters:
a record may carry a `homebrew:` source without coming from a side-car, and sweeping the namespace
would delete one. See ADR-0007.

### Not writing a character whose records did not move

This rule belongs to **entry-edit propagation**, above, rather than to the surface described in this
section. A character whose records did not actually move is **not written**: restamping `updatedAt`
on every referencing character for a prose fix would reorder the character list for a change none of
them can see.

`updateCharacterRefs` deliberately does not follow it, and the asymmetry is the point. There, a
re-sync may genuinely change nothing; there, the caller has just changed what the character carries,
so a write that left `updatedAt` alone would hide a real change from the character list.

## Provenance and the toggle

**Source is `homebrew:<type>:<index>`.**

- **The type is in the string**, not just the index. Indexes are scoped per table, so a subclass and
  a race may both be `stormborn`; without the type their records would collide on `modifierId` and
  silently overwrite each other.
- **The index survives an edit**, because CONTEXT.md § Catalog reference fixes it for the entry's
  life — a rename moves the display name only. So a re-sync lands on the same ids and the merge
  finds the player's toggle where it left it.
- **Import is the one thing that moves an index**, when a collision renames an incoming entry to
  `-2`. `rewriteModifierSource` repoints the record's source and id along with the refs. It needs
  writing by hand rather than falling out of `rewriteCharacterRefs`'s deliberately field-by-field
  style, because a source is a *different grammar* — `homebrew:<type>:<index>`, not
  `homebrew:<index>` — so the compiler cannot catch it. Missing it strands the record permanently:
  the character points at the renamed entry while the record names the old index, and a merge that
  scopes by source can then neither re-derive nor remove it.
- **`homebrew:` was already in `effects.ts`'s `TOGGLEABLE_SOURCES`** and already named in
  CONTEXT.md § Toggle, both written before anything could produce a record under it. This ticket is
  what finally does.

### Seeded enabled — the one place this departs from ADR-0004

ADR-0004 seeds SRD feature records **off**, and gives a good reason: they are situational
transcriptions whose conditions the app cannot evaluate, so seeding Unarmored Defense on would state
an AC the character may not have.

Entry-authored records are seeded **on**, because the reasoning does not transfer. An author who
typed "+1 AC" on their own subclass meant +1 AC; a record arriving switched off would read as the
app having ignored what they wrote. The player may still switch it off — the drawer offers the
switch either way. That is the intended division: **the author states what the entry does, the
player states whether it currently applies.**

## Validation happens at authoring time

A record naming a target outside the closed vocabulary is refused by the editor, not by `derive()`.

The two failures are not the same failure. A bad target reaching `derive()` throws a
`ModifierValidationError` **on the character sheet** — at the table, on someone else's device, long
after the typo. Caught at authoring time it is an issue next to the field that caused it, in the same
`modifiers.<n>.<field>` dotted grammar the schema issues use, so the editor renders one list without
knowing which half of the row a problem came from.

`attack.<weaponId>.*` is accepted deliberately. The weapon id comes from the character's own
equipment, so an entry genuinely cannot know whether it will resolve — and an unresolved attack
target is a miss the sheet renders, not a malformed record. This is the same line ADR-0005 drew for
overrides.

**Still no balance or sanity checks.** A record may say `+40 AC`. Schema-valid remains valid, and
mechanical sanity is the table's business.

## Delete, backup, and the paths that already worked

- **Delete is still blocked while referenced**, unchanged: the block is a scan of character *refs*,
  and a modifier is not a ref. An entry with records is exactly as deletable as one without.
- **Backups carry the side-car**, because `collect.ts` embeds whole rows and `import.ts` stores the
  candidate's own fields rather than the schema's parsed output — a decision made for a different
  reason (not stripping fields a newer build wrote) that turns out to cover this one. Verified with
  a round-trip test rather than trusted: a backup that silently dropped an entry's records would
  restore a subclass deriving a different AC with nothing saying why.
- **A dangling ref drops its records.** An entry that has been deleted already renders as
  `⚠ unknown`; a number left behind by an entry nobody can open is one nothing on the sheet can
  explain.

### Rejected

- **Fork or loosen the vendored schemas** (option 1). Rejected above — it is the invariant #165's
  seam comment declined to spend, and nothing about this ticket makes it cheaper.
- **A separate `dnd_homebrew_modifiers` table.** Keyed by `type:index`, it keeps the row pristine and
  is genuinely tidier on paper. Rejected because every read of an entry becomes two reads that can
  disagree, and the backup, import and delete paths would each need a second thing to remember —
  precisely the "stale index fails silently" failure `references.ts` already refuses to build.
- **Apply on read instead of at creation.** Rejected for ADR-0004's reason, restated: a record
  resolved on read is not a record, because `enabled` is stored state.
- **Let the author set `enabled`.** It is the player's flag. An author shipping a record pre-disabled
  would be authoring a switch position rather than a rule.

## What stays settled

- **The vendored schemas are strict, and stay strict.** The side-car is beside them, never inside.
- **`stripSideCar` is the one place the split is made.** Three callers strip these keys; a fourth
  that stripped only the one it knew about is exactly the drift the single list prevents.
- **A source that embeds an index has to be repointed wherever a ref is.** The two grammars differ,
  so this is a hand-written pairing rather than one the types enforce — and it has a regression test
  precisely because nothing else would catch it.
- **Catalog rows carry none**, so catalog and homebrew stay interchangeable in derivation and
  creation.
- **The merge preserves `enabled`**, drops what the entry no longer authors, and touches no other
  namespace — the same three rules `syncFeatureModifiers` follows, scoped to one source.
