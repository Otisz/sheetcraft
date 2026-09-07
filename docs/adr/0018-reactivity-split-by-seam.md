# Split reactivity by seam: query library for the network, live queries for storage

The app uses two data libraries on purpose. TanStack Query owns network work — fetching the Manifest and downloading Catalogs, with its retry and status handling. Dexie's live queries own every read from local storage.

Each is used for what it is actually good at, and the seam between them is the network boundary, which is easy to hold in your head. Using the query library for local reads would mean invalidating after every write on a screen where nearly every element is an editable control; using live queries for the network would mean rebuilding retry and error states by hand.

## Consequences

Decrementing hit points writes to storage and every subscribed component updates with no invalidation call, and consistency across browser tabs comes for free.
