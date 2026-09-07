# Parse and migrate every Character document on load

Characters carry a schema version and are validated on write and on load, with an explicit migration chain between versions. Validating data we ourselves wrote looks redundant and is not.

Stored data outlives the code that wrote it: a Character written by last week's build can be missing fields today, and there is no export, no backup and no second copy (ADR-0019). An unparseable Character is unrecoverable data loss, so a migration chain is the difference between "old Characters need fixing up" and "old Characters are gone". This matters most during development, when the schema changes weekly and the test data is the developer's own characters.

## Consequences

Parsing happens once when a Character is loaded into memory, not on every reactive read, so the guarantee costs nothing during play.
