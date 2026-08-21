# ADR-0002: Vitest, engine-first testing, TDD for logic only

- **Status:** Accepted
- **Date:** 2026-08-21
- **Ticket:** [Decide the testing approach for the derivation engine](https://github.com/Otisz/sheetcraft/issues/149)

## Context

The derivation engine is pure logic with a large rules-correctness surface: AC across armor types
and Unarmored Defense variants, proficiency bonus by level, spell slots by class and level, skill
modifiers with Expertise, save DCs. **Getting it wrong is silently wrong at the table** — nobody
gets a stack trace, they just take the wrong amount of damage.

Both runner options were spiked in the actual compose container (`oven/bun`, bun 1.3.14).

## Decision

**Tests exist in MVP.** **Vitest** as the runner. Coverage is the derivation engine plus the Dexie
paths that can destroy user data. **TDD for logic, not for UI.**

## Runner: Vitest over bun test

Both work. Measured, in-container:

| | result |
|---|---|
| `bun test` | 12 derivation cases, **74ms**, zero config, TS + `test.each` built in |
| `vitest run` | 9 cases incl. Dexie, **202ms**, v4.1.11 |

**bun test is faster and needs no dependency.** Vitest wins anyway on two grounds:

1. **Path aliases.** The repo uses `@/*` (declared in `package.json#imports`). Vitest resolves it
   from Vite config; verified with a real `import { maxHp } from "@/features/dnd/derive"`. Under
   `bun test` this needs separate configuration, and the two would then drift.
2. **`fake-indexeddb/auto` works under Vitest and does not under bun.** Verified: under bun it
   throws `MissingAPIError: IndexedDB API missing` and requires explicit
   `new Dexie(name, { indexedDB: new IDBFactory(), IDBKeyRange })` injection — meaning test code
   would construct the database differently from production code. Under Vitest the bare
   `import "fake-indexeddb/auto"` works and production construction is exercised as written.

The second point is decisive: a test that instantiates its subject differently from production is
testing something other than production.

Speed is not a real differentiator at this scale — both are well under a second.

## Coverage

**Tested:**

- **Derivation engine** — modifier resolution (`override → set → add → min → max`), AC across armor
  / Unarmored Defense / shields, `maxHp` from per-level rolls, proficiency bonus, skill and save
  modifiers, spell save DC.
- **Dexie critical paths** — the two places a bug silently destroys user data:
  - **catalog re-seed rollback.** Verified: `clear()` + `bulkPut()` inside one transaction, thrown
    mid-way, leaves the *old* two rows intact. This is the guarantee
    [the catalog sync decision](https://github.com/Otisz/sheetcraft/issues/145) rests on.
  - **homebrew delete-block scan** — the full-character scan finds referencing characters.
- **Export/import round-trip**, once [that ticket](https://github.com/Otisz/sheetcraft/issues/151)
  lands. It is the last line of defence against IndexedDB eviction; an export that cannot be
  re-imported is worse than none.
- **Slug generation** — including the apostrophe rule (`Healer's Kit` → `healers-kit`).

**Not tested:** React components, routes, the sheet UI. On a solo project component tests rot
fastest and slow iteration most, and the sheet is verified by looking at it on a phone.

## Fixtures

Hand-authored characters with **independently verifiable** expected values — transcribed from real
published stat blocks rather than computed by the engine under test. A fixture whose expected value
came from running the code proves only that the code is self-consistent.

Kept as typed literals next to the engine, not JSON, so a schema change breaks compilation rather
than failing mysteriously at runtime.

## TDD

**Test-first for the engine** — derivation, modifier resolution, export round-trip. The expected
values come from the rulebook, so the test genuinely can be written before the implementation, and
that ordering is what stops fixtures being reverse-engineered from the code.

**Not test-first for UI** — the sheet, routes, and homebrew forms are built by looking at them.

## CI

**None in MVP.** There is no `.github/workflows` and this is a solo local-first project; the honest
answer is that a CI pipeline nobody watches is theatre. Tests run locally in the container:

```bash
docker compose exec app bunx vitest run     # or --watch
```

Revisit if the project gains contributors.

## Consequences

- Adds `vitest`, `fake-indexeddb` and a `vitest.config.ts` as dev dependencies.
- `vitest.config.ts` must keep its alias in step with `package.json#imports`; a drift there produces
  confusing resolution failures.
- Verified working: Vitest **4.1.11** under bun 1.3.14 in the container, with `@/` aliasing and
  `fake-indexeddb` both functioning.
