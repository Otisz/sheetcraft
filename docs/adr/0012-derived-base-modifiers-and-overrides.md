# Compute a base, adjust with Modifiers, and always allow an Override

Every value on the Derived Sheet is computed from what the app can know, adjusted by a flat list of named additive Modifiers the player maintains, and ultimately replaceable by an Override.

There is no clean line where "formula" stops and "rules engine" starts — armor class alone spans unarmored defense, fighting styles, armor categories and magic items — so instead of choosing a point on that spectrum, the app computes what is unambiguous and hands the player one primitive for everything else. At a table, being wrong is survivable; being wrong and unfixable is not.

## Considered Options

Modifiers carrying an operation of add-or-set was rejected: a `set` operation is an Override spelled a second way. A separate Override map makes it explicit, and obliges the interface to show an overridden value *as* overridden with a one-action clear.

Attaching Modifiers to owned items — so equipping a ring applies its bonus — was rejected because the upstream equipment data carries no modifier information at all, so every item's effects would have to be hand-authored regardless. A player-added row with an enable toggle reaches the same result honestly.

## Consequences

One primitive serves armor class, hit point maximum, speed, initiative, saves, skills, ability scores, spell save DC, spell attack bonus and passive perception. It is also what makes several other decisions safe — the tolerant armor heuristic in ADR-0015 is acceptable precisely because an Override exists behind it.
