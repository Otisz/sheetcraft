# Prefix every Ref with its origin, before Homebrew exists

Every Ref is stored as `catalog:human`, not `human`, even though `catalog:` is the only prefix the resolver understands and Homebrew is not implemented.

Adding the prefix costs one string concatenation today. Adding it later is a data migration touching every Ref in every Character — and Characters have no backup of any kind (ADR-0019), which makes migrating them the riskiest operation this app can perform. The resolver throws on any other prefix rather than pretending to be general.

## Consequences

When Homebrew lands, deleting a Homebrew entry that a Character references will be forbidden rather than allowed to dangle. That keeps unresolvable Refs structurally impossible, so no Sheet ever has to render a missing-content placeholder.
