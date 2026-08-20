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

- **Tier 1 (21 KB gzipped)** — `classes`, `subclasses`, `races`, `subraces`. The minimal-creation
  picker set. **Blocks** behind the sync gate; ~0.9s on weak venue wifi.
- **Tier 2 (197 KB gzipped)** — everything else, including spells. Downloads in the background;
  nothing ever waits on it.

Not a `required` boolean — booleans are not indexable in Dexie, and the tier number carries more
meaning.

## Sync gate

The provider on the `/dnd` layout route that blocks first paint until tier 1 is installed. Not a
route loader — loaders are SWR-cached, re-run on navigation, and non-blocking past ~1000ms.

Clears when the manifest version matches `dnd_meta.manifestVersion` and tier-1 tables are non-empty.

## Homebrew

User-authored content conforming to the **same schema as a catalog entry**, so it behaves
identically in derivation and character creation. Stored in parallel tables
(`dnd_catalog_races` / `dnd_homebrew_races`).

## Catalog reference

A namespaced string pointing at catalog or homebrew content: `catalog:human`, `homebrew:azureborn`.
The prefix selects the table; the suffix is the entry's `index`.

Parsed in exactly **one** place — `resolveRef(type, ref)`. Nothing else splits the string.

Homebrew deletes are **blocked** while any character references the entry, so a homebrew ref never
dangles. Catalog refs can still dangle after an upstream re-seed; those render as
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

## Hit point rolls (`hpRolls`)

The one input that looks derived but isn't. At each level-up a 2014 player either rolls a hit die or
takes the fixed average, so the roll is a genuine input. Stored as a **per-level array**, not a
total: `maxHp = sum(hpRolls) + conMod * level`, which stays correct when CON changes.

## Modifier record

A typed, structured adjustment to one derivable value. The **only** mechanism by which a feature,
item, or player choice changes a number.

```ts
{ id, source, target, op, value, enabled, label }
```

- **target** — a flat string path from a **closed** vocabulary (`ac`, `skill.stealth`, `save.dex`,
  `attack.<weaponId>.hit`, `spell.saveDc`, …). Unknown targets are validation errors, not no-ops.
- **op** — `add` | `set` | `min` | `max`. Numeric only.
- **value** — a number, or a **reference** (`{ref:'mod.con'}`, `{ref:'proficiencyBonus'}`) resolved
  at derivation time so it never goes stale.
- **source** — namespaced provenance (`feature:*`, `equip:*`, `item:*`, `override`), powering the
  "why is my AC 17?" trace.
- **enabled** — the toggle. See *Toggle*.

Defined in [Design the modifier record and derivation engine](https://github.com/Otisz/sheetcraft/issues/143).

## Toggle

The `enabled` flag on a modifier record, flipped by the player on the sheet. Sheetcraft has **no
condition vocabulary and no expression language** — the player is the condition evaluator, because
they are already the rules engine at the table. This is the boundary that keeps Sheetcraft from
becoming a rules engine.

## Derivation

Computing a displayed value from a **base formula** plus the active modifier records targeting it.
Resolution is **phased**, so record order never affects the result:

```
override (short-circuit) → set → add → min → max
```

## Base formula

Hardcoded arithmetic for a derived value, using structural catalog data. AC's base formula reads
armor's `{base, dex_bonus, max_bonus}`; everything a *feature* contributes arrives as a modifier
record instead, because SRD features are prose-only.

## Override

A player-supplied value replacing a derived one. Stored as a modifier record with
`source: 'override', op: 'set'` — **not** a separate field. One mechanism, one explanation path;
clearing an override means deleting the record.
