# Own the Catalog schemas; use upstream schemas as a build-time drift alarm

The upstream `5e-bits/5e-database` project ships Zod schemas alongside its data, and vendoring them wholesale is the obvious path. We validate against them at build time only, then map the data into our own schemas, which are what the app and storage actually use.

The upstream schemas describe a REST API, not a local-first app: they are strict objects that forbid additional fields, they carry `url` values pointing at a remote API we never call, and they model content choices as a deeply recursive union we have decided not to consume (ADR-0014). They are genuinely valuable as a contract against upstream change, and genuinely wrong as our runtime types.

## Consequences

Our transform renames `index` to `id`, drops `url`, flattens nested API references to plain slug strings and camelCases keys, while keeping descriptive prose because the Sheet displays it.
