# Sheetcraft

Sheetcraft is a character sheet for tabletop roleplaying games, used at the table in place of paper. It does the arithmetic a paper sheet cannot — derived totals and live play state — and it deliberately stops short of adjudicating rules.

The first supported Game is D&D 5e (2014). Games are standalone: this glossary's general terms apply across the app, and the D&D terms are scoped to that Game.

## Language

### Games and content

**Game**:
A supported tabletop system, such as D&D 2014. Each Game is self-contained — its content, its rules and its screens share nothing with another Game.
_Avoid_: system, ruleset, edition

**Catalog**:
A published set of reference content for one Game — its races, classes, spells, equipment and so on — authored upstream and shipped with the app rather than created by the player. Spelled the American way throughout, including in code.
_Avoid_: catalogue, game data, content pack, reference data

**Catalog Entry**:
A single item within a Catalog: one race, one spell, one weapon.
_Avoid_: record, item, definition

**Manifest**:
The index of the Catalogs published for a Game, and the thing a client consults to learn whether its copy is current.
_Avoid_: index, catalog list

**Homebrew**:
Content authored by the player rather than published in a Catalog. Reserved in the model; not yet implemented.
_Avoid_: custom content, user content

**Ref**:
A stored pointer to a Catalog Entry, always written with its origin — `catalog:human`. A Ref names where content came from, not merely which content it is.
_Avoid_: id, key, slug, reference

**Fixed Vocabulary**:
The parts of a Game that are settled and offer the player no choice — its abilities, skills, alignments, conditions, damage types, languages. Distinct from a Catalog because it can never be absent, stale, or chosen between.
_Avoid_: static data, constants, lookup tables

### The character

**Character**:
The complete stored document for one player character: who they are, what they own, and how they currently stand. There is no separate record for the live half.
_Avoid_: character data, character record, PC

**Play State**:
The fields of a Character that change during a session — current hit points, temporary hit points, expended Slots, spent Resources, Death Saves, Conditions, inspiration. Named as a group because it changes constantly, not because it is stored apart.
_Avoid_: session state, runtime state, live data

**Sheet**:
The single screen that presents and edits a Character. There is no separate edit mode and no edit page; the Sheet is the only editing surface.
_Avoid_: character page, detail view, edit screen

**Level**:
The character's advancement, entered directly by the player. Experience points are not part of this domain.
_Avoid_: XP, experience, tier

**Level Table**:
The per-Level progression a class publishes: proficiency bonus, granted features, Slots and Resource maxima at each Level.
_Avoid_: class table, progression chart

### Derived values

**Derived Sheet**:
Every computed value for a Character, produced together from the Character and the Catalog content it references. Read-only: nothing about a Character is stored in derived form.
_Avoid_: computed stats, calculated values, character stats

**Modifier**:
A named, additive adjustment the player adds to one Derived Sheet value — "Defense fighting style +1", "Ring of Protection +1". Always visible and always attributable; a Modifier the player cannot explain is a bug.
_Avoid_: bonus, buff, effect, adjustment

**Modifier Target**:
The named Derived Sheet value a Modifier applies to, such as armor class, a particular saving throw, or a particular skill.
_Avoid_: stat, field, attribute

**Override**:
A value typed in by the player that replaces derivation entirely for one Modifier Target. The app's guarantee that it can never be both wrong and unfixable.
_Avoid_: manual value, custom value, hardcoded value

### Play

**Resource**:
A countable pool the character spends and regains — rages, ki points, sorcery points, lay on hands. Some come from the Level Table; the rest the player adds.
_Avoid_: charges, uses, pool, ability uses

**Recharge**:
When a Resource refills: on a short rest, on a long rest, or never. Carried by each Resource individually rather than inferred from the character's class.
_Avoid_: reset, refresh, restore condition

**Rest Preview**:
The itemised list of changes a rest proposes, shown and individually confirmable before anything is applied. A rest never changes a value the player has not agreed to.
_Avoid_: rest summary, rest result

**Slot**:
A spell slot at a given spell level, tracked as a maximum and a spent count. Warlock pact magic is a Slot like any other.
_Avoid_: spell slot level, casting resource

**Spell Entry**:
A spell on a Character's list, carrying whether it is currently prepared and whether it is always prepared. One shape covers every casting style — known, prepared, and spellbook.
_Avoid_: known spell, prepared spell, spell reference

**Attack Row**:
An editable line in the attacks list — name, ability, proficiency, damage. Created by picking an item the character owns, which fills it in, after which every field is the player's.
_Avoid_: weapon, attack entry, action

**Equipped**:
A flag on an owned item meaning the character is currently wearing or wielding it. There are no slots and no validation; what is Equipped is whatever the player says.
_Avoid_: worn, wielded, active, slotted

**Death Saves**:
The successes and failures recorded once a character is at zero hit points. Tapped by the player, never inferred, and replacing hit points on the Sheet while they apply.
_Avoid_: death saving throws, dying state

**Condition**:
A named state the character is under, such as poisoned. Recorded and displayed only — a Condition changes no number anywhere.
_Avoid_: status, effect, ailment
