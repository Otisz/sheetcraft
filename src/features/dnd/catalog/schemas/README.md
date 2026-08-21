# Vendored upstream schemas

These files are copied **verbatim as source** from
[5e-bits/5e-database](https://github.com/5e-bits/5e-database), pinned at commit
`bfd3db4bcc31699cce703b46feb9af3f0ff08999`, from `src/2014/schemas/` and
`src/schemas/common.ts`.

They are vendored rather than depended on because the upstream package is
`"private": true` and unpublished.

## Local modifications

Exactly two, applied mechanically by hand:

1. `import { z } from 'zod'` → `import * as z from "zod"`, the namespace form
   that resolves under both bun and Vitest with zod 4.
2. The relative `'../../schemas/common'` import → the `@/` alias path for the
   local sibling.

Nothing else is edited. The schema definitions themselves are untouched, so a
diff against upstream stays legible.

## Why the pin matters

The schemas are `z.strictObject`. A field added upstream **hard-fails**
validation rather than degrading, so the data and the schemas must move
together. Re-vendoring is therefore a deliberate, two-part act:

1. Bump `UPSTREAM_SHA` in `../manifest.ts`.
2. Re-copy these files at the new SHA, re-applying the two modifications above.
3. `docker compose exec app bun run vendor:srd`
4. `docker compose exec app bunx vitest run`

## Attribution

Upstream code, including these schema files, is MIT licensed:

> MIT License
> Copyright (c) [2018-2020] [Adrian Padua, Christopher Ward]

See [`../../../../../public/srd/ATTRIBUTION.md`](../../../../../public/srd/ATTRIBUTION.md)
for the full notice covering both the code and the SRD content it describes.
