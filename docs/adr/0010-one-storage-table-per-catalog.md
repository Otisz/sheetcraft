# Give each Catalog its own storage table

Catalog content is stored one table per Catalog — Game-prefixed, as `dnd_catalog_races`, `dnd_catalog_spells` and so on — rather than in a single table keyed by Catalog and entry.

A single keyed table would avoid a storage-schema version bump each time a Catalog is added, which is a real advantage. We chose per-Catalog tables anyway because the Catalog set is fixed and known for this Game, typed per-table accessors are worth more day to day than the occasional migration avoided, and the naming mirrors the Homebrew tables that will sit beside them.
