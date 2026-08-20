# CONTEXT

Glossary / ubiquitous language for Sheetcraft. Use these terms exactly; don't drift to synonyms.

Scope note: this project is currently **D&D 2014 only**. Games are standalone with no cross-game
abstraction, so every term below is dnd-scoped and dnd-prefixed in storage (`dnd_characters`).

## Catalog

Read-only game content vendored from [5e-bits/5e-database](https://github.com/5e-bits/5e-database)
(SRD, 2014). Served as static JSON from `public/` and cached in Dexie. Never fetched from a
third-party API at runtime.

## Homebrew

User-authored content conforming to the **same schema as a catalog entry**, so it behaves
identically in derivation and character creation. Stored in parallel tables
(`dnd_catalog_races` / `dnd_homebrew_races`).

## Catalog reference

A namespaced string pointing at catalog or homebrew content: `catalog:human`, `homebrew:azureborn`.
The prefix selects the table; the suffix is the entry's `index`.

## Character record

One Dexie record holding both **character data** (name, class, level, abilities — changes rarely)
and **play state** (current HP, expended slots, death saves, modifier toggles — changes constantly).
They live together by design; see [#139](https://github.com/Otisz/sheetcraft/issues/139).

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
