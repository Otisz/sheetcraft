# One pure entry point owns all derivation

The whole Derived Sheet is produced by a single pure function taking a Character and its resolved Catalog content, built internally from small named functions, with no React and no storage access anywhere inside it.

The dependency order is real — ability scores, then Modifiers, then proficiency bonus, then saves and skills, then passive perception, then armor class, then spell save DC — and it must be expressed exactly once. Per-value hooks scattered across components would let two screens quietly disagree about the same number, which is the specific failure a character sheet cannot have.

## Consequences

This is the primary test seam for the entire application: a fixture Character in, expected numbers out, no browser and no database. It is also why the rules can be tested before any interface exists.
