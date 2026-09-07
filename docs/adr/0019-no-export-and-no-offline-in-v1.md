# Accept that version 1 has no backup

Version 1 ships no import, no export, no service worker and no installability. A Character exists only in browser storage on one device.

This is a known and accepted risk, not an oversight. Browsers may evict local storage after a period of inactivity, and without installability the app cannot claim persistent storage that way either — so a Character built over months can be lost. Version 1 was scoped strictly to reach a working foundation, and this is deferred to version 2.

## Consequences

The parse-and-migrate discipline of ADR-0011 is mandatory rather than good practice, and the prefixed Refs of ADR-0009 exist to avoid a future migration, because a migration over unbacked data is the most dangerous thing this app can do. Anyone reopening this ADR should treat export as the cheapest available mitigation.
