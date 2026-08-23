# ADR-0004: SRD features become modifier records through a hand-authored index map

- **Status:** Accepted
- **Date:** 2026-08-23
- **Ticket:** [SRD features as modifier records](https://github.com/Otisz/sheetcraft/issues/170)

## Context

`CONTEXT.md` § Base formula says everything a *feature* contributes "arrives as a modifier record
instead, because SRD features are prose-only". No ticket had ever said **who writes those records**.

The consequence was structural, not cosmetic: `createCharacter` seeded only racial ability bonuses
(`race:<ref>`), so no character the app could produce carried a `feature:` record. Grepping the tree
for one found a single hit — `feature:expertise`, synthesized inside `derive()` and never persisted.
Every character therefore opened the "Effects & conditions" drawer on its empty state, and two of
[#163](https://github.com/Otisz/sheetcraft/issues/163)'s acceptance criteria were unreachable by a
user despite being implemented and tested.

All 407 entries in `features.json` carry `desc` as English prose and nothing structured:

```
barbarian-unarmored-defense | While you are not wearing any armor, your Armor Class equals
                              10 + your Dexterity modifier + your Constitution modifier.
monk-unarmored-defense      | Beginning at 1st level, while you are wearing no armor and not
                              wielding a shield, your AC equals 10 + your Dexterity modifier
                              + your Wisdom modifier.
```

Two features sharing the display name "Unarmored Defense" and one ability apart.

## Decision

**A hand-authored map from feature `index` → modifier record templates.** Explicitly partial, and
data rather than a branch per feature.

Three things follow from choosing the `index` as the key:

- **`index`, never `name`.** The two Unarmored Defenses share a name and differ in the ability they
  add. Keying on the name would make one of them wrong, at the only feature #163 names.
- **The map is small and admits it.** Most of the 407 entries change no number this app derives.
  They stay prose on the Features tab, which is where the player already reads them.
- **Nothing SRD-specific gates the lookup.** The map is consulted for whatever feature indexes a
  character actually has, so a homebrew class whose features happen to match is covered by the same
  code path — and homebrew that ships its own records keeps writing them to `character.modifiers`
  directly, exactly as [#165](https://github.com/Otisz/sheetcraft/issues/165) settled.

### Rejected

- **Parse the prose.** Rejected on sight elsewhere in this project's history; recorded here so it is
  not re-proposed. Also unbounded: "your AC equals 10 + DEX + CON" and "you gain a +2 bonus to attack
  rolls you make with ranged weapons" are the same grammar to a parser and different vocabularies to
  this engine.
- **Ship no SRD map, make it homebrew's job.** Cheapest, and it means a stock barbarian's Unarmored
  Defense does nothing until the player hand-authors it. A poor first impression is a real cost.

## Where the records attach

**At creation, and re-derived from class/subclass/level whenever those change.** The alternative —
resolving on read — was rejected because a record resolved on read is not a record: `enabled` is
stored state, and a list rebuilt on every read has nowhere to keep the player's toggle.

Re-derivation is therefore a **merge, not a replace**: `syncFeatureModifiers` keeps the `enabled`
flag of any feature record already on the character, drops records whose feature the character no
longer has, and leaves every non-`feature:` record untouched. A barbarian who levels to 3 does not
find Unarmored Defense switched back on.

Because the ids are derived from the source and target (`feature:<index>:<target>`, the same shape
`racialModifiers` uses), the merge is a set operation on stable keys rather than a diff.

## Default `enabled`

**Off**, for every situational feature — which in practice is all of them.

`enabled` is the only toggle mechanism: Sheetcraft has no condition vocabulary and no expression
language, because the player is the condition evaluator (CONTEXT.md § Toggle). Unarmored Defense is
conditional on wearing no armor, and the app does not evaluate that condition. Seeding it *on* would
state an AC the character may not have; seeding it *off* states nothing and asks. The drawer is
where the player answers.

That also gives the toggle something to *do* on the first character a user creates, which is the
whole point of the ticket.

## The boundary

**The closed target vocabulary is the boundary.** A feature that cannot express itself as a `Target`
is one this app does not compute, and it stays prose rather than getting a target invented for it.
That is why the map covers the AC and speed features and skips Rage: Rage's benefits are advantage
on STR checks, bonus melee damage, and resistance to three damage types — none of which is a value
`derive()` produces. Giving it a target would put a number on the sheet that the rules do not have.

Unarmored Defense in particular is an `op: "add"` of `{ref:'mod.con'}` (or `mod.wis`) on `ac`, **not**
a replacement base formula: the base already yields `10 + dexMod` when no armor is equipped.
