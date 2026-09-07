# Local-first, client-only storage

Sheetcraft is used at a table, by one player, on one device, with no collaboration and no need for anyone else to read a Character. Everything is stored in the browser on the device, with no account, no sync and no server-side data, which removes authentication, hosting cost and privacy questions from the project entirely.

## Consequences

A Character exists in exactly one place, on one device, in storage the browser is permitted to evict. See ADR-0011 and ADR-0019, which exist because of this.
