# Characters hold live Refs to Catalog Entries, not snapshots

A Character stores a Ref to each piece of content it uses and resolves it at read time. It does not embed a copy, so a Catalog correction reaches every existing Character.

The usual argument for snapshotting — that a content update must never silently change a character mid-campaign — does not apply while the only published content is frozen SRD 5.1 (ADR-0003). Snapshots would double the storage of every Character and permanently fork it from its source in exchange for protection against a change that cannot happen.

## Consequences

This decision is scoped to Catalogs. Homebrew is mutable by nature, which is why deleting referenced Homebrew is forbidden outright (ADR-0009) rather than handled with a snapshot.
