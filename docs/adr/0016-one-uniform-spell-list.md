# Model every casting style with one uniform spell list

A Character has a single list of Spell Entries, each carrying whether it is prepared and whether it is always prepared. There is no per-class branching anywhere in the spell model.

D&D 2014 has at least three incompatible casting styles — known casters, daily-preparation casters, and the wizard's spellbook-plus-preparation — and modelling them faithfully means encoding class rules, which ADR-0014 forbids. The uniform shape degenerates correctly for all of them: the spellbook is the list and prepared is a subset, a known caster simply has everything prepared, and domain, oath and racial spells use the always-prepared flag. Warlock pact magic needs no special case either, since Slots are Slots.

## Consequences

Spells are shown for every character, including those of classes that cannot cast, because subclasses and races grant cantrips to fighters and rogues.
