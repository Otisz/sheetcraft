# CONTEXT

Glossary / ubiquitous language for Sheetcraft. Use these terms exactly; don't drift to synonyms.

Scope note: this project is currently **D&D 2014 only**. Games are standalone with no cross-game
abstraction, so every term below is dnd-scoped and dnd-prefixed in storage (`dnd_characters`).

## Catalog

Read-only game content vendored from [5e-bits/5e-database](https://github.com/5e-bits/5e-database)
(SRD, 2014). Served as static JSON from `public/` and cached in Dexie. Never fetched from a
third-party API at runtime.

## Catalog tier

Which load phase a catalog belongs to, declared in the manifest as `tier: 1 | 2`.

- **Tier 1 (32 KB gzipped)** — `classes`, `subclasses`, `races`, `subraces`, `levels`. The
  minimal-creation set. **Blocks** behind the sync gate; ~1.35s on weak venue wifi. `levels` was
  promoted from tier 2 because subclass timing is only derivable from it — see
  [#147](https://github.com/Otisz/sheetcraft/issues/147).
- **Tier 2 (186 KB gzipped)** — everything else, including spells. Downloads in the background;
  nothing ever waits on it.

Not a `required` boolean — booleans are not indexable in Dexie, and the tier number carries more
meaning.

## Catalog manifest

`public/srd/manifest.json` — what the vendoring pipeline emits and the sync gate reads. Produced by
`scripts/vendor-srd.ts`, run **manually**, never on build.

Carries a **single global `version`** for the whole set; the data files are content-hashed
(`races.75e6e99c.json`) and therefore immutably cacheable, which makes per-file versions redundant.
Each entry declares `id`, `filename`, `bytes` and [tier](#catalog-tier).

Validated against its own zod schema before it is written, so an invalid manifest never reaches
`public/`. Every field derives from the bytes and entries are ordered by id, so re-running the
script against an unchanged pin produces **no diff**.

## Upstream pin

The upstream commit SHA the catalog was vendored from, recorded in the manifest and declared in
`src/features/dnd/catalog/manifest.ts`.

**Not optional.** The upstream zod schemas are `z.strictObject`, so a field added upstream
**hard-fails** validation rather than degrading. Floating on a branch would turn an upstream commit
into a broken app. Content and schemas move together: re-pinning means re-running the vendor script
*and* re-copying the vendored schemas.

Those schemas are **vendored as source** under `src/features/dnd/catalog/schemas/`, not depended
on — upstream marks the package `"private": true` and never publishes it. Types are **inferred from
them**, never hand-written alongside, so a hand-written type cannot drift from the validator.

Vendored content carries **MIT** (the code) plus **OGL 1.0a** (the SRD material) attribution; see
`public/srd/ATTRIBUTION.md`.

## Sync gate

The provider on the `/dnd` layout route that blocks first paint until tier 1 is installed. Not a
route loader — loaders are SWR-cached, re-run on navigation, and non-blocking past ~1000ms.

Clears when the manifest version matches `dnd_meta.manifestVersion` and tier-1 tables are non-empty.
Both halves are checked: the version row could outlive a wipe of the object stores, and a gate
trusting the number alone would render creation pickers with nothing in them.

On a mismatch it blocks on **tier 1 only** and starts [tier 2](#catalog-tier) without awaiting it.

`CatalogSyncProvider` is the wiring; the logic lives in `features/dnd/catalog/sync.ts` behind an
injected `fetch`, which is how the whole thing is tested without a browser.

## Re-seed

Installing one catalog. **Per-catalog and transactional**, and the ordering is load-bearing:

```
parse and validate BEFORE opening the transaction
  → clear() + bulkPut() together in one transaction
    → dnd_meta.manifestVersion written LAST, after every tier-1 catalog succeeds
```

Each step buys something specific:

- **Parse first.** Awaiting a non-Dexie promise *inside* a transaction auto-commits it, and the
  next write then throws `TransactionInactiveError`.
- **`clear()` + `bulkPut()` together.** A failure rolls back to the *old* rows, so the table is
  never empty. The app degrades to stale data, never to no data.
- **`bulkPut`, not `bulkAdd`.** A re-seed is an upsert, and a caught `BulkError` from `bulkAdd`
  still persists its successful rows — a half-populated table that looks complete.
- **Version last.** An interrupted sync re-runs on next load rather than being falsely marked
  current.

Each tier records its completion under its own `dnd_meta` key — `manifestVersion` for tier 1, which
is what the gate blocks on, and `tier2Version` for tier 2, which nothing blocks on but which stops a
warm start re-downloading 186 KB on every mount.

Only `dnd_catalog_*` is touched. [Homebrew](#homebrew) is structurally out of reach.

## Sync failure

Classified, because the classification decides what the user is offered:

| kind | cause | surface |
|---|---|---|
| `offline` | the request never completed | retry |
| `http` | non-2xx; a stale manifest 404s here | retry, naming the catalog |
| `malformed` | not JSON, or failed its zod schema | retry; old data kept |
| `quota` | IndexedDB is full | **no retry** — retrying cannot help |
| `write` | any other write failure | retry |

**Tier-1 failure** blocks, with an inline retry *and* a way back out — a character whose catalogs
are already installed must stay reachable, so the gate is never a dead end. **Tier-2 failure** shows
a persistent, dismissible banner and the app stays usable; silent retry was rejected because the gap
is otherwise invisible until someone hits a half-populated picker and concludes the app is broken.

## Homebrew

User-authored content conforming to the **same schema as a catalog entry**, so it behaves
identically in derivation and character creation. Stored in parallel tables
(`dnd_catalog_races` / `dnd_homebrew_races`).

## Homebrew authoring tiers

Which editing surface a homebrew type gets, driven by measured entry complexity:

- **Form** — `equipment` (15 leaves), `subrace` (16), `spell` (32), `race` (49). Shallow enough for
  a phone form.
- **Minimal form** — `subclass`. Name, parent class, level features as prose + modifier records.
  Not the full schema (worst case 625 leaves); shipped anyway because the SRD has only one subclass
  per class.
- **JSON editor only** — `class` (190 leaves, 11 deep) and `background` (168). A phone form for
  these is not buildable. Zod-validated paste, errors reported per path.

The JSON editor accepts **every** type, so it is the escape hatch that makes "homebrew uses the same
schema as catalog" honest.

## Catalog reference

A namespaced string pointing at catalog or homebrew content: `catalog:human`, `homebrew:azureborn`.
The prefix selects the table; the suffix is the entry's `index`.

Parsed in exactly **one** place — `resolveRef(type, ref)`. Nothing else splits the string.

Homebrew **edits apply live** — a character references by id, so changing an entry recomputes every
character using it. Edits show which characters are affected (informational, non-blocking); deletes
are **blocked** while referenced, so a homebrew ref never dangles. The asymmetry is deliberate: an
edit changes a referent that still exists, a delete would strand the character.

Homebrew ids are name slugs scoped to the homebrew table (`Azureborn` → `homebrew:azureborn`).
`catalog:human` and `homebrew:human` coexist — the prefix disambiguates. Strip apostrophes
**before** the separator pass, or `Healer's Kit` slugs to `healer-s-kit` instead of `healers-kit`.
A collision within the type takes a `-2`, `-3` suffix; the catalog table is not consulted, because
it is a different namespace.

The id is **assigned once and then held fixed**. A rename moves the display name only — the id is
what every character points at, so re-slugging on rename would dangle exactly the references the
delete block exists to protect. Catalog refs can still dangle after an upstream re-seed; those render as
`⚠ unknown (<index>)` and derived values fall back to base rather than throwing.

## Character record

One Dexie record holding both **character data** (name, class, level, abilities — changes rarely)
and **play state** (current HP, expended slots, death saves, modifier toggles — changes constantly).
They live together by design; see [#139](https://github.com/Otisz/sheetcraft/issues/139).

## Input vs derived

The character record stores **inputs only**. AC, max HP, proficiency bonus, ability modifiers,
skill/save modifiers, spell save DC, initiative and slot maxima are **derived on every read** and
never stored — a stored copy is a copy that can go stale.

`abilities` holds **base** scores; racial bonuses and ASIs are modifier records targeting
`ability.<abil>`, so every point is traceable to its source.

## Subclass timing

The level at which a class chooses its subclass. **Derived, never hardcoded**: the first level whose
`Levels` row carries a `subclass` field — 1 for cleric/sorcerer/warlock, 2 for druid/wizard, 3 for
the other seven. Deriving it means a homebrew class shipping its own `Levels` rows gets correct
timing for free.

The field is **required at or above the threshold and hidden below it**. Below it, an already-chosen
subclass is **kept, not cleared** — dropping the value would lose a choice to a mis-tap on the level
stepper, and a hidden value is simply not required. A change of *class*, by contrast, does clear it:
the subclass belonged to the old class.

`null` — rather than an unreachable 21 — is what "this class never picks a subclass" looks like, so
that case stays distinguishable from a very late one.

## Ability entry method

How base scores get entered: **manual** (no bounds — there are deliberately no balance warnings,
mechanical sanity is the table's business), **standard array** (15/14/13/12/10/8, each value
assigned exactly once), or **point buy** (8–15, budget 27, PHB cost table, which the standard array
happens to cost exactly).

**Switching method resets to that method's defaults** rather than clamping what came before: a
manual 18 silently becoming a point-buy 15 is more surprising than an obvious reset, because the
user never sees it happen.

Racial bonuses apply **after** the method's ceiling, as [modifier records](#modifier-record) — so a
dwarf with a point-buy 15 legitimately reaches CON 17, and the stored `abilities` stay exactly as
entered. See [Input vs derived](#input-vs-derived).

## Hit point rolls (`hpRolls`)

The one input that looks derived but isn't. At each level-up a 2014 player either rolls a hit die or
takes the fixed average, so the roll is a genuine input. Stored as a **per-level array**, not a
total: `maxHp = sum(hpRolls) + conMod * level`, which stays correct when CON changes.

**Creation takes the fixed average** — the full hit die at level 1, then `die / 2 + 1` per level —
because creation does not roll dice. The values are stored as ordinary rolls, so editing them later
is editing an input, with nothing special-cased about how they got there. A new character's
`currentHp` starts at the derived maximum: a character created at 0 opens on the death-save panel,
which is the loudest possible lie about a character nobody has played yet.

## Installed (Home Screen web app)

Sheetcraft running from the iOS Home Screen in `display: standalone`. **The only documented
exemption from WebKit's 7-day deletion of script-writable storage, IndexedDB included.**

Requires a manifest with `display: standalone` plus an `apple-touch-icon` (which takes precedence
over manifest icons on iOS). **No service worker** — not required by iOS or Chromium, and offline
mode remains out of scope.

Detected with `matchMedia('(display-mode: standalone)')`.

**The migration trap:** installing does **not** copy IndexedDB — only cookies. A user who creates
characters in a Safari tab and then installs lands in an empty app. Hence the install nudge fires
**before** any character exists, and export/import is the only route across that boundary.

`navigator.storage.persist()` is **not** the durability mechanism — the exemption is keyed to
installed status. Being installed is a heuristic WebKit uses when *granting* persist(), not the
reverse. Called opportunistically, never surfaced to the user.

## Backup file

The export artifact — `sheetcraft-backup-<date>.json`. Self-contained: characters plus **only the
homebrew entries they reference**, so a restore onto a wiped device produces no dangling refs.
Catalog refs (`catalog:human`) are **not** embedded; they resolve against the importing device's SRD.

Carries two versions: `formatVersion` (the envelope) and `schemaVersion` (the records inside).
A newer `formatVersion` is **refused**, never guessed at. An older one migrates forward through
`backup/migrate.ts` — a chain keyed by the version each step migrates *from*, deliberately separate
from Dexie's `version().upgrade()`, because a file's records never pass through that path: they
arrive as plain objects and land in a database already at the current version.

Validation is **loose where the schema is loose and strict where the sheet would break**. Unknown
fields survive a round-trip; a character missing `classRef` does not. Homebrew goes through
`validateEntry` — the same gate the forms and the JSON editor pass — with `updatedAt` stripped
first, since it is storage bookkeeping and the vendored schemas are `z.strictObject`.

Import **never overwrites** — every imported character gets a fresh id and a `(imported)` name
suffix, applied **unconditionally rather than only on a name collision**: an import is always a
copy, and one that looks like the original is exactly what the never-overwrite rule exists to
avoid. Imported homebrew whose index is taken becomes `azureborn-2`, and the imported characters
are rewritten to point at their own copy. `createdAt` is kept and `updatedAt` is stamped: the
character really was created when the file says, but this copy arrived now, and the list sorts by
`updatedAt`.

Everything is planned — reads, slug resolution, validation — **before** the write transaction opens,
for the reason the [re-seed](#re-seed) does the same: awaiting a non-Dexie promise inside a Dexie
transaction auto-commits it. What remains inside is writes only, so a failure rolls the import back
to nothing.

### Getting the file off the device

**Web Share first, `<a download>` as the fallback.** The one rule the whole delivery module is
shaped around: **serialise before the tap handler awaits anything.** Web Share needs transient
activation, and an `await` on IndexedDB consumes it — `share()` then rejects with `NotAllowedError`.
`deliverBackup` therefore takes an already-built `File`, so there is nowhere inside it to await
storage.

Three more, each from a specific finding: a **successful share is the end of it** (falling through
to a download leaves two copies to reconcile); **`AbortError` means the user cancelled**, so it does
not fall back and does not stamp a backup that never happened; and the object URL is **revoked
late**, because an immediate revoke can silently cancel the download.

`<a download>` has worked on iOS since 13 — the "iOS ignores download" advice is stale. The belief
that iOS blocks sharing `.json` is also unsupported by WebKit's source: `Navigator::canShare` checks
only that the files array is non-empty.

### Backup age

`dnd_meta.lastExportedAt`. Past **7 days** — WebKit's own clock — a backup is stale. The banner
needs *both* staleness and something to lose: it is gated on the most recent character `updatedAt`,
derived from the records rather than tracked separately, because a second timestamp every writer
must maintain is a second thing that goes stale. A prompt users learn to dismiss on sight is worse
than one that arrives when something is actually at risk.

## Currency

`play.currency: { cp, sp, ep, gp, pp }` — **play state, not character data**, because money changes
every session. Declare the keys in ascending value (cp → pp): the sheet renders from
`Object.entries`, so key order is display order.

Identified as a gap in the record during [the sheet prototype](https://github.com/Otisz/sheetcraft/issues/150) —
it was absent from the schema entirely.

## Condition

An SRD condition (Prone, Poisoned, …; 15 of them) tracked on a character as a **reminder only**.

**Declared in source** (`features/dnd/play/conditions.ts`), not vendored: there is no `conditions`
catalog in the upstream pin and no table for a ref to resolve against. The set is fixed at 15 and
has not moved since 2014, so a source literal is honest where a lookup would be theatre. They are
still stored on `play.conditions` as `catalog:` refs, and parsed through `resolveRef`'s accessors
like every other ref.
Conditions carry **no modifier record** — their real effects are advantage/disadvantage and movement,
which Sheetcraft does not compute. The sheet renders them visually distinct from
[Toggle](#toggle)-driven effects so the UI never implies arithmetic the app didn't do.

## Modifier record

A typed, structured adjustment to one derivable value. The **only** mechanism by which a feature,
item, or player choice changes a number.

```ts
{ id, source, target, op, value, enabled, label }
```

- **target** — a flat string path from a **closed** vocabulary (`ac`, `initiative`, `speed`,
  `skill.stealth`, `save.dex`, `attack.<weaponId>.hit`, `spell.saveDc`, …). Unknown targets are
  validation errors, not no-ops. The vocabulary grows only as the engine learns to derive a value —
  a target nothing computes would be a record that silently does nothing.
- **op** — `add` | `set` | `min` | `max`. Numeric only. `min` and `max` name the **bound, not the
  function**: `min` is a floor (the value becomes *at least* the amount), `max` is a ceiling. This
  is the SRD's own reading — "your AC can't be less than 12" is a `min` of 12 — so `op:'min'` is
  arithmetically `Math.max`. Several `set`s resolve last-wins; `set` is the one non-commutative op.
- **value** — a number, or a **reference** (`{ref:'mod.con'}`, `{ref:'proficiencyBonus'}`) resolved
  at derivation time so it never goes stale.
- **source** — namespaced provenance (`feature:*`, `equip:*`, `item:*`, `override`), powering the
  "why is my AC 17?" trace.
- **enabled** — the toggle. See *Toggle*.

Defined in [Design the modifier record and derivation engine](https://github.com/Otisz/sheetcraft/issues/143).

## Toggle

The `enabled` flag on a modifier record, flipped by the player on the sheet.

**Only `feature:`, `item:` and `homebrew:` records are toggleable**, and the play surface offers a
switch for those alone. `race:` records are character data — a pill offering to turn a Dwarf's +2
CON off is the accidental edit that edit-by-separation exists to prevent — and `equip:` records
follow from equipping the item, not from a switch. Stated as a positive list rather than as "not an
override", because the exclusion definition silently sweeps in every namespace added later.
 Sheetcraft has **no
condition vocabulary and no expression language** — the player is the condition evaluator, because
they are already the rules engine at the table. This is the boundary that keeps Sheetcraft from
becoming a rules engine.

## Derivation

Computing a displayed value from a **base formula** plus the active modifier records targeting it.
Resolution is **phased**, so record order never affects the result:

```
override (short-circuit) → set → add → min → max
```

Within a phase, records apply in whatever order they are stored — every op but `set` is
commutative, so that cannot change a result. Validation runs over **every** modifier, enabled or
not: a typo that only surfaces when the player flips a [Toggle](#toggle) mid-session is exactly the
trap a closed vocabulary exists to prevent.

**References resolve acyclically.** `ability.*` targets resolve first and cannot themselves use a
`{ref}`, because every reference is expressed in terms of ability scores. A racial bonus or ASI is
a plain number, which is all this restriction costs. Proficiency bonus resolves next; everything
else may reference either.

Implemented in `src/features/dnd/derive/`, pure — no Dexie, React, network or clock, asserted by
a test rather than assumed.

## Base formula

Hardcoded arithmetic for a derived value, using structural catalog data.

**Initiative** is a raw DEX check (PHB p.189) — the proficiency bonus never applies, so it is the
DEX modifier plus any `initiative` records. **Speed** reads the race's own `speed`, floored at 0 as
a visible trace step; nothing in the 2014 rules reduces a speed below 0, so the floor catches a
homebrew or override that subtracts too much.

AC's base formula reads armor's `{base, dex_bonus, max_bonus}`; everything a *feature* contributes arrives as a modifier
record instead, because SRD features are prose-only.

```
base = equippedArmor
  ? armor.base + (armor.dex_bonus ? min(dexMod, armor.max_bonus ?? Infinity) : 0)
  : 10 + dexMod
```

Two SRD traps, both confirmed against the vendored data:

- **The Shield's `base: 2` is additive, not absolute.** It is an armor entry like any other, so
  reading it as the base armor yields an AC of 2. Shields are partitioned out of the base formula
  and contribute an `equip:shield` step instead — which is also how the trace reads on the sheet.
- **`max_bonus` is absent, not null**, on unlimited-dex light armor. Missing therefore means
  Infinity; reading it as 0 costs a DEX 18 rogue four points of AC.

A proficient skill or save adds the proficiency bonus to the **base**, not as a step: it is not a
modifier record, and inventing one would put an entry in the trace that nothing in the character's
data corresponds to.

**Expertise** is the opposite case — it *is* a record: an `add` of `{ref:'proficiencyBonus'}`, never
a special doubling operation. So it appears in the trace as its own step, which is what lets the
sheet answer "why is my Stealth 7?", and it moves when the bonus does.

Passive perception is `10 + the perception check modifier`, so anything moving the check has
already moved the passive score; `passivePerception` records land on top of it.

Spell save DC (`8 + proficiency + ability`) and spell attack bonus (`proficiency + ability`) are
`null` for a non-caster, not 0 — a number there is one the sheet cannot tell from a real one.

## Derive context

The resolved catalog data one derivation needs: the equipped armor entries, the skill and expertise
proficiencies, and the class's spellcasting ability. All are *structural* SRD data, and
[derivation](#derivation) is pure, so they arrive as a second argument to `derive(character, context)`
that the caller resolves through `resolveRef` — keeping ref parsing in the one place it lives.

Skill proficiencies arrive as resolved `Skill` values, not as the `catalog:` refs the record stores.
Matching refs inside the engine would encode the ref grammar a second time, which is the duplication
[catalog reference](#catalog-reference) exists to forbid.

**Required, never defaulted.** A context that defaulted to empty would silently derive AC 10 for an
armored character, which is a wrong number with no way to notice.

## Override

A player-supplied value replacing a derived one. Stored as a modifier record with
`source: 'override', op: 'set'` — **not** a separate field. One mechanism, one explanation path;
clearing an override means deleting the record.

The `op: 'set'` half is **enforced**, not merely conventional: an override carrying any other op is
a validation error, because resolution would treat it as a `set` regardless and honouring something
the record does not say is how a sheet starts lying. Several overrides on one target resolve
last-wins — a second override is the player changing their mind.
