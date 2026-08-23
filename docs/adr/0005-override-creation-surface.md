# ADR-0005: Override creation lives on the tabs, with a drawer for the ten values the tabs cannot reach

- **Status:** Accepted
- **Date:** 2026-08-23
- **Ticket:** [Override creation: give the override marker something to mark](https://github.com/Otisz/sheetcraft/issues/171)

## Context

`CONTEXT.md` § Override defines an override as "a player-supplied value replacing a derived one".
Every half of the mechanism existed except the one that makes it reachable:

- **Resolution** short-circuits on `source: "override"` before any phase, last-wins (`resolve.ts`).
- **Validation** rejects a non-`set` override as a `ModifierValidationError` (`derive.ts`).
- **The marker** — the amber "overridden" caption — renders on any key stat carrying one.
- **Clearing** deletes the record, which is the only mechanism an override has.

**Nothing created one.** The whole feature was reachable only from a test, which is why
[#163](https://github.com/Otisz/sheetcraft/issues/163)'s criterion "overridden values carry a visible
marker and can be cleared" was honestly implemented and equally honestly unexercisable.

The hard part is not the write. It is *where the write lives*, because an override is a **player-supplied
value** — play state by intent — that targets values rendering as **character data**. Play mode
prevents accidental edits by separation rather than by a lock (#150): character data is not tappable
there at all. Tapping AC on the play screen to override it re-opens the exact affordance
edit-by-separation closed.

### The coverage that decides it

There are **38 overridable targets**: 8 scalars, and the `ability.*`, `save.*` and `skill.*` families
at 6, 6 and 18. Auditing where each one is *rendered* splits them unevenly:

| | count | rendered on |
|---|---|---|
| Tab-rendered | 28 | Skills (`passivePerception`, `save.*`, `skill.*`), Combat (`maxHp`), Spells (`spell.saveDc`, `spell.attack`) |
| Header-only | 10 | `ac`, `initiative`, `speed`, `proficiencyBonus`, `ability.*` — `character-sheet.tsx` and nowhere else |

That table is the decision. The ticket proposed putting creation "on the value, but only from a
non-play surface" and called it the likely answer — and for 28 of 38 targets it is. For the other
ten there is no non-play surface to put it on, because those values render only on the play header,
which is deliberately untappable.

## Decision

**Two surfaces, one mechanism.**

1. **Tap the value on its tab** — the 28 tab-rendered targets. Overriding a skill modifier happens
   next to the skill list, which is where the player is already looking.
2. **`⋯` → Overrides** — a drawer listing the 10 header-only targets, set and cleared from there.

Both write the same record through the same function: `source: "override"`, `op: "set"`,
`enabled: true`, id from `modifierId(source, target)`. There is no second code path, and no
override-shaped field anywhere in the record.

**This is a synthesis, not one of the ticket's three options.** The ticket listed the drawer as
option 1 and criticised it for burying a mid-session correction three taps deep. That criticism is
not answered here — it is *scoped*: it now applies to ten values instead of thirty-eight, and to the
ten that are least likely to need a mid-session correction, since AC and proficiency bonus change
with equipment and level rather than mid-combat. A player who does need one still pays three taps.
Recorded as a known cost rather than as a solved problem.

### Why this does not violate edit-by-separation

The separation rule is about **what the play surface affords**, not about which screen a value
appears on. It is preserved in the sense that matters:

- **The play screen's read-only surfaces stay read-only.** `KeyStats` and the `Abilities` grid gain
  no *creation* affordance. The only interactive thing either grows is the **clear** action on an
  already-visible marker.

  Worth stating precisely, because it is the one place this ticket touches the read-only rule at
  all: before this change the `Abilities` grid contained no interactive element whatsoever, and it
  now contains one — a clear button, rendered *only* when that ability already carries an override.
  For a character with none, the grid is exactly the plain text it was. The precedent is `StatTile`,
  which has offered the same clear-on-marker control since [#163](https://github.com/Otisz/sheetcraft/issues/163),
  whose own criterion was that overridden values "carry a visible marker **and can be cleared**".
  Marking a value without offering the undo would be a claim with no way back.

  A reviewer who reads "the play screen's read-only surfaces stay read-only" as forbidding even
  this would be reading it defensibly. The judgement here is that *clearing* is the second half of
  *marking*, not a form of editing — but it is a judgement, not something the ticket settles.
- **The tabs were never the untappable surface.** #164 built them as the place the rest of the
  record is consulted, and they already carry mutable play state — hit dice steppers, the
  inspiration switch, slot steppers, the notes field. A tap that overrides a skill modifier is the
  same kind of affordance in the same kind of place.
- **The drawer is the `⋯` menu**, which is the door edit-by-separation *designates* for character
  data. Putting the ten hardest values behind it is the rule being followed, not bent.

### Rejected

- **Long-press on the play screen.** Rejected once already: [#150](https://github.com/Otisz/sheetcraft/issues/150)
  killed variant B because long-press is undiscoverable without hint text. Recorded here so it is
  not re-proposed a third time.
- **One Overrides drawer for all 38.** One affordance and one explanation, which is genuinely
  tidier. Rejected because it takes the 28 values that *have* a natural home and moves them three
  taps away from it — the ticket's own criticism of option 1, applied to the whole vocabulary
  instead of to the remainder.
- **Move `ac`, `initiative`, `speed`, `proficiencyBonus` and the abilities onto tabs** so pure
  option 2 could cover everything. Rejected because it re-opens #164's settled information
  architecture to serve a feature that is not the reason those values sit in the header. They are in
  the header because they are read constantly; that is still true.

## Marker coverage follows creation coverage exactly

**An override the player can create but cannot see is worse than no override** — the sheet would
show a hand-set number with nothing saying so. Before this ticket the marker existed on 4 of 38
targets, because those were the tiles #163 happened to build.

Creation and marker coverage are therefore checked as one thing, in the shape `tabs.test.ts` already
uses for field homes: every overridable target is claimed by exactly one creation surface, and the
projection behind that surface carries the override, so a target cannot gain a way to be set without
gaining a way to be seen. A test rather than a convention, for the reason the field-home map is a
test — the two halves drift the moment a target is added otherwise.

That is also why the `Abilities` grid gains a marker despite gaining no tap: its six values became
settable in this ticket, so they became markable in it too.

## The `attack.*` gap, stated rather than closed

`attack.<weaponId>.<hit|damage>` is a real target — `derive()` accepts it and `resolve()` will
short-circuit on it — but it is **not** one of the 38, because its keys come from the character's own
equipment and no surface can enumerate them. `setOverride` refuses to write one.

Refusing to create is not the same as refusing to exist. `backup/parse.ts` validates imported
characters with `z.looseObject` and does not inspect `modifiers` at all, so a hand-edited or
third-party backup can carry an `attack.*` override into the database. Verified: such a record
derives without throwing.

So the Combat tab **marks** an overridden attack row, with no clear control beside it. Half a pair is
the right answer here: offering *clear* on a family with no *create* would imply an affordance the
app does not have, while showing nothing at all is the silent hand-set number this ticket exists to
prevent. Whether `attack.*` earns a real creation surface belongs to whichever ticket needs it.

## One table, not three

The eight scalar targets were originally enumerated three times: once for which surface offers them,
once for the header-only subset, and once in a `switch` translating a target to its field on
`Derived`. Adding a scalar meant remembering all three, and the two that fail silently are the
surface (a value with no way to be set) and the reader (an editor that opens on `undefined`).

They are now one entry each in `SCALAR_TARGET_INFO`, carrying `surface` and `read` together, with the
parameterised families kept as a prefix rule in `FAMILY_INFO` rather than expanded to thirty rows.
`overrideSurface` and `derivedValueFor` both read those tables, so a target cannot have a surface
without also having a reader.

This tightened the tests rather than loosening them: removing one scalar now fails six cases instead
of three, because the surface and the reader are the same entry.

`overrideSurface`, `isOverridable` and `setOverride` still take a bare `string` **on purpose** — they
are the validating boundary, called with stored and imported targets that have not been checked.
Everything downstream of them takes `EnumerableTarget`, which makes `attack.*` and malformed targets
a compile error at the call site rather than a runtime throw.

## On testing UI-shaped things

ADR-0002 excludes React components from the test surface, and the marker-coverage block in
`overrides.test.ts` reads `.tsx` files. It is not a component test — nothing renders, and no DOM is
asserted on; it reads source text the way `tabs.test.ts` already reads it to check that a
`renderedBy` names a component somebody actually wrote.

The distinction is worth keeping: what is tested is the **coupling between two data structures and
the files that honour them**, not component behaviour. It also earned its keep immediately. The
first version matched `/overridden/` against whole files, and every one of those files *documents*
the marker in a docblock — both real markers could be deleted from the play header and the assertion
still passed. It now strips comments and scopes each match to the named component's own body, and a
mutation that removes a marker fails the suite.

## What stays settled

- **`op: "set"`, enforced.** Any other op is a validation error. Resolution would treat it as a
  `set` regardless, and honouring something the record does not say is how a sheet starts lying.
- **Not a separate field.** An override is a modifier record. One mechanism, one explanation path.
- **Clearing means deleting.** There is no disabled-override state.
- **Last-wins on one target.** A second override replaces the first — the player changing their
  mind, not an error to block.
- **Overrides are not effects.** They stay out of the effects row's positive toggle list: a pill
  that turns off but does not clear would be a switch with no honest meaning.
