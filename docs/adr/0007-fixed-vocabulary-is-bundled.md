# Bundle the Fixed Vocabulary instead of publishing it as Catalogs

The abilities, skills, alignments, conditions, damage types, languages, weapon properties and magic schools are compiled into the application as typed constants rather than downloaded as Catalogs, even though they arrive in the same upstream dataset as everything else.

They are roughly 40 KB, unchanged since 2014, and represent no player choice — so routing them through the Catalog pipeline would create three failure states (missing, stale, download-failed) for data that cannot change, and force an await before rendering a skill list. As constants they also yield literal union types used to type Modifier Targets, making `skill.acrobatics` a compile-time-checked string.

## Consequences

Changing them requires a deploy, which is the correct cost for data frozen for over a decade. They ship only in the Game's route chunks, because route-level code splitting is on by default — a visitor to the landing page or a future second Game never downloads them.
