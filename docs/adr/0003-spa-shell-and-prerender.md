# ADR-0003: `spa` and `prerender` compose, but the filter is a trap

- **Status:** Accepted
- **Date:** 2026-08-21
- **Ticket:** [Project scaffolding: test harness and dependencies](https://github.com/Otisz/sheetcraft/issues/155)

## Context

The MVP spec flagged an urgent, unverified build question: TanStack Start's `spa` mode and
`prerender` were never confirmed to compose in a real build. The intended shape is that `/` and
`/games` prerender to static HTML while everything under `/dnd` — client-only, reading from Dexie
behind the sync gate — ships via the SPA shell.

Verified with a real `vite build` in the compose container (vite 8.2.1, bun 1.3.14).

## Decision

**They compose.** Configure `spa.maskPath: "/dnd"` alongside `prerender.enabled: true`, with a
`prerender.filter` that excludes discovered `/dnd/*` routes **while explicitly sparing the mask
path itself**.

```ts
spa: { enabled: true, maskPath: "/dnd" },
pages: [{ path: "/" }, { path: "/games" }],
prerender: {
  enabled: true,
  crawlLinks: false,
  filter: (page) => page.path === "/dnd" || !page.path.startsWith("/dnd"),
},
```

## The trap

The SPA shell is **not** a separate build stage. `postBuild` appends it to `startConfig.pages` as an
ordinary page at exactly `maskPath`, then hands the whole list to the same prerenderer:

```js
// @tanstack/start-plugin-core/dist/esm/post-build.js
startConfig.pages.push({
  path: maskUrl.toString().replace("http://localhost", ""),
  prerender: { ...startConfig.spa.prerender, headers: { [HEADERS.TSS_SHELL]: "true" } },
  sitemap: { exclude: true },
});
```

So the obvious filter is silently wrong:

```ts
filter: (page) => !page.path.startsWith("/dnd")   // ✗ drops the shell too
```

That build **succeeds** and prerenders `/` and `/games` — but emits no `_shell.html` at all, so the
entire `/dnd` tree ships nothing. There is no error, no warning. The failure is invisible until a
route 404s in production.

Conversely, omitting the filter entirely emits the shell but lets route autodiscovery **SSR
`/dnd/`** with its real content — the opposite of client-only.

Only sparing the mask path explicitly gives both.

## Verified output

| Path | Result |
|---|---|
| `dist/client/index.html` | prerendered, contains the route's real content |
| `dist/client/games/index.html` | prerendered, contains the route's real content |
| `dist/client/_shell.html` | SPA shell; body is `<!--$--><!--$--><!--/$-->`, no route content |
| `dist/client/dnd/index.html` | correctly absent — not SSR'd |

## Two gates, not one

The prerender filter is a **build-time** guarantee about which HTML files get emitted. It is not a
statement about rendering. The route-level counterpart is a single `ssr: false` on the `/dnd` layout
(`src/routes/dnd/route.tsx`), which inherits hard to every child.

Both are needed and they cover different things. `ssr: false` gates **rendering, not module
evaluation** — a top-level `new Dexie(...)` in an imported module still executes on the server and
still throws `indexedDB is not defined`. Keep Dexie construction inside effects and hooks, never at
module scope.

## Consequences

- The filter must be revisited whenever `maskPath` changes; the two are coupled and nothing enforces
  it. A blanket prefix filter is the natural thing to write and is wrong.
- Verifying this needs entity-aware assertions. Prerendered HTML is minified and escaped — grepping
  for `D&D` against `D&amp;D` yields a false negative and makes a working build look broken.
- `crawlLinks: false` keeps the prerendered set explicit rather than link-derived.
