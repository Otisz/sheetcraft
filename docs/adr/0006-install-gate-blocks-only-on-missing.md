# Block on missing Catalogs, never on stale ones

The download gate blocks the player only when a Catalog is entirely absent. A stale-but-present installation renders immediately from the local copy and refreshes in the background.

Blocking on any version mismatch would let a routine content patch put a loading screen between a player and their Sheet in the middle of combat — the one moment the app must not fail them. Correspondingly, a failed fetch is silent when local data exists and is an explicit error with a retry only when there is nothing to fall back on, because character creation is genuinely impossible without content.
