# ADR-0007: Equipment and spells are edited behind the `⋯` menu, and the repository owns the re-sync

- **Status:** Accepted
- **Date:** 2026-08-24
- **Ticket:** [Equipment and spell editing, and the modifier re-sync it owes](https://github.com/Otisz/sheetcraft/issues/176)

## Context

[#174](https://github.com/Otisz/sheetcraft/issues/174) gave homebrew entries modifier records and
applied them through `syncAllEntryModifiers`, called from `createCharacter` and nowhere else.
ADR-0006 recorded why that was sound — nothing in the app changed a character's refs after creation
— and named the trap that would land the moment something did.

Scoping the fix turned up the larger problem. `equipment` and `spells` were **not merely unedited,
they were unreachable**:

- `emptyCharacterDefaults` seeded `equipment: []` and `spells: { known: [], prepared: [] }`.
- `CreateCharacterInput` had no field for either, so creation could not seed them.
- `updateCharacter`'s production callers wrote `play`, `modifiers` and `name`.

So **no character this app could produce had ever had a single item or spell on it.** The Inventory
and Spells tabs rendered a list that was structurally always empty, and `derive()`'s whole
armor/weapon path — `equip:` modifiers, AC from armor, the `attacks` array — was reachable only from
tests. The same shape [#170](https://github.com/Otisz/sheetcraft/issues/170) found for feature
records and [#171](https://github.com/Otisz/sheetcraft/issues/171) found for overrides: the
mechanism implemented and tested, and nothing able to create the input it consumes.

## Decision

**Two `⋯` menu drawers, and a repository seam that cannot forget the re-sync.**

- **`⋯` → Equipment** — what the character carries, quantity, and an equip switch.
- **`⋯` → Spells** — what they know, and which are prepared.
- **`updateCharacterRefs`** — the only write path for either field, which applies the change *and*
  re-syncs entry-authored records in one transaction.

The Inventory and Spells tabs are unchanged. They stay the read-only surfaces
[#164](https://github.com/Otisz/sheetcraft/issues/164) built, which is where the record is
*consulted*.

### Why the `⋯` menu rather than the tabs

The tabs are the tempting answer — the player is already looking at the list, and ADR-0005 put
override creation on them precisely because 28 of 38 targets already rendered there. That precedent
does not carry, and the reason is `equipped`.

Equipping drives the `equip:` records `derive()` computes armor AC from. `effects.ts` already
refuses to put those in the effects drawer's toggle list, in terms that decide this ticket too:

> **`equip:`** — driven by equipping the item, not by a toggle. Two ways to unequip a shield is one
> way too many, and they would disagree.

An equip switch on the Inventory tab is that second way. It also puts a control that silently moves
AC on a screen designed for mid-combat use, which is the accidental edit edit-by-separation exists
to prevent (#150). ADR-0005 could argue the tabs were never the untappable surface because the
affordances it added were *taps on a value the player was already reading*; an equip switch is not
that. It is a character-data edit with a derived-number consequence, and the `⋯` menu is the door
edit-by-separation designates for exactly that.

The cost is the one ADR-0005 accepted and is accepted again here: a mid-session equipment change is
three taps deep. Recorded as a known cost rather than a solved problem.

### `equipped` stays character data

`CharacterEquipmentEntry` folds carrying and wielding into `{ itemRef, quantity, equipped }`, and
the ticket asked whether *drawn* is really play state. It is arguably truer to the domain, and it is
rejected:

- It is a **schema change** with a backup migration, for a distinction the sheet does not currently
  render anywhere.
- It would put the AC-moving toggle back on the play surface, which is the thing `effects.ts`
  refuses. Moving it to `play` does not make it safe to tap mid-combat; it makes it *easier* to tap
  mid-combat.

One flag, one switch, in one place. `toggleEquipped` is the only thing that moves it.

### Starting equipment is not seeded

The SRD ships `starting_equipment` and `starting_equipment_options` per class and background.
Creation seeds **neither**; the player adds everything by hand.

`starting_equipment_options` is a choice UI — pick A or B, pick two of four, and some options are
themselves categories — which is its own ticket's worth of work with its own validation. Seeding
only the unconditional half was considered and rejected as the worst of the three: a character
arriving with a half-loadout reads as the app having lost the choices it did not offer, which is
precisely the "could the app have lost them?" question `spellSection`'s empty message is written to
answer. Not seeding at all is legible; seeding partially is not.

### Spells are unfiltered and unlimited

Any spell may be added to `known` or `prepared`, with no class-list filter and no derived counts.

The app does not derive class spellcasting rules — which classes prepare rather than know, how many
of each a level allows, what a subclass grants — so a limit here would be the app **refusing a legal
choice it cannot actually adjudicate**. A `classes`-array filter is the tempting cheap version and
fails concretely: a homebrew spell whose `classes` is empty becomes unpickable, as does anything
granted by a subclass rather than a class.

This is the line ADR-0006 already drew for authored records, restated: schema-valid is valid, and
mechanical sanity is the table's business.

`prepared` is **not filtered to `known`**, matching `spellSection`, which unions the two rather than
filtering: a cleric prepares from the whole class list, so a prepared spell can be absent from
`known` entirely.

## The re-sync, and where it lives

**`updateCharacterRefs`, not a second call the caller must remember.**

The trap ADR-0006 named is that a homebrew item acquired after creation contributes no records until
its entry is next saved. The obvious fix — "call `syncAllEntryModifiers` from the drawer too" — is
rejected: a rule enforced by every caller remembering it is a rule that lasts until the second
caller. So the write and the sync are one function, and `equipment` / `spells` have no other
production write path.

They share **one transaction**, with the homebrew tables in its scope because the sync reads them. A
sync that committed and a write that then failed would leave a character carrying records for an
item they do not have.

### Removal needed the sweep, which acquisition did not reveal

Acquiring works because `syncAllEntryModifiers` walks the character's refs and derives records from
each. **Removal does not follow from it**, and the test written for it is what showed this:
`mergeModifiers` only drops records belonging to a source it is *given*, and a dropped item is
precisely an entry the walk no longer visits. Its records would sit on the character forever — a
number the sheet cannot explain, from an item the player is not carrying.

So the walk now collects the sources its current refs justify and **sweeps entry-authored records
outside that set**.

The scope of that sweep is load-bearing and was narrowed after it broke an existing test. It matches
the `homebrew:<type>:<index>` grammar `entryModifierSource` writes — **not** the `homebrew:` prefix.
A record may carry a `homebrew:` source without having come from a side-car at all: `createCharacter`
accepts author-supplied records, and `feature-seeding.test.ts` asserts a two-segment
`homebrew:azure-ward` survives creation. Sweeping the whole namespace would delete it on the
character's first loadout change. The type segment is what lets the sweep tell records it wrote from
records that merely share the prefix.

## The write is a function, not a patch

`updateCharacterRefs` accepts either a patch or **a function of the stored record**, and the drawers
pass the function.

The drawers render from the `character` prop, which is replaced only once a mutation settles and its
invalidation lands. A patch built from that prop is built from a snapshot — and two quick taps both
compute from the same one, so the second silently discards the first. Every other mutation on the
sheet has the same shape, and it has not mattered: an override is set once, a condition is toggled
once. The quantity stepper is the first control on this sheet built for **repeat taps**, so it is
the first place the window is reachable by an ordinary interaction rather than a race.

The fix is nearly free because the transaction has already read the current row; handing it to the
caller costs nothing. A patch stays accepted, because a single settled write is exactly that.

## `LoadoutChanges` is the two ref fields, and nothing else

An earlier draft included `modifiers`, on the grounds that the drawers might want to toggle an
acquired item's record through one seam. Removed, for two reasons that only became clear once
nothing used it:

- **A toggle is not a ref change.** It owes no re-sync, and routing it here would re-derive every
  entry's records to write a boolean. `useUpdateModifiers` already owns that write.
- **It cost the type its guarantee.** The point of this seam is that everything through it has moved
  a ref, so the sync it triggers is always warranted. "Fields the drawers might touch" is not that
  property, and a type that admits a field with no caller is an affordance nobody asked for — the
  same shape of gap this ticket exists to close.

## What this makes reachable

- **`derive()`'s equip path.** Armor AC and the `attacks` array were reachable only from tests that
  hand-built a `DeriveContext`. `loadout-repository.test.ts` now walks acquire → equip → derive
  through `loadDeriveContext`, so the whole path from the drawer's write to the number on the sheet
  is exercised as a unit.
- **The delete block on equipment and spell entries.** It was always implemented — `homebrewRefsOf`
  has read both locations since it was written — and always vacuous, because no character could hold
  such a ref. It is now tested against a ref a player can actually create.

## `editedBy` on the field-home map

`CHARACTER_FIELD_HOMES` recorded `renderedBy` for every field, which after this ticket says
something true but incomplete about `equipment` and `spells`: they are rendered by `Items` and
`SpellList`, and *changed* somewhere else entirely. A map that recorded only the first would claim
the sheet is read-only about them.

So the map gains `editedBy`, checked the same way `renderedBy` is — against components read off the
source. This is the lesson `renderedBy` itself was added for: an earlier version of the map recorded
only the tab, and five fields sat in it with no pixels behind them while the coverage test passed on
the map entry alone.

## Rejected

- **Edit on the tabs.** Rejected above: an equip switch is not the same kind of affordance as
  ADR-0005's tap-the-value-you-are-reading, and `effects.ts` already refuses `equip:` a second
  switch.
- **A "drawn" flag split out into `play`.** Rejected above — a schema change and a backup migration,
  which lands the AC toggle back on the play surface.
- **Filtering the spell picker to the class list.** Rejected above: it blocks legal choices the app
  cannot adjudicate, and fails outright for homebrew and subclass-granted spells.
- **Seeding starting equipment.** Deferred, not refused — it wants the options chooser to be
  meaningful, and that is a creation-flow ticket.
- **Calling `syncAllEntryModifiers` from the drawers.** Rejected above: a rule every caller must
  remember lasts until the second caller.
- **Removing records by walking the refs the change dropped.** The seemingly cheaper alternative to
  the sweep. It requires diffing before and after, which means the sync needs the *previous*
  record — and a caller that passed the wrong one would strand records silently. The sweep needs
  only the character's current refs, which is the state the record already holds.

## What stays settled

- **`equipped` is character data, moved only by `toggleEquipped`.** One flag, one switch.
- **The Inventory and Spells tabs stay read-only.** They render; the drawers change.
- **`equipment` and `spells` have one production write path**, and it re-syncs.
- **The sweep is scoped to `homebrew:<type>:<index>`**, never the bare namespace — and has a
  regression test, because nothing else would catch a widening.
- **No balance, class-list or count enforcement.** Schema-valid is valid.
