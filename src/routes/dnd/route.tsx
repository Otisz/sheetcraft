import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * The `/dnd` layout route. Everything below it is client-only — it reads from
 * Dexie behind the sync gate, and IndexedDB does not exist on the server.
 *
 * `ssr: false` inherits hard to every child route, so this single declaration
 * covers the whole tree. It gates *rendering*, not module evaluation: a
 * top-level `new Dexie(...)` in an imported module still runs on the server.
 * Keep Dexie construction inside effects/hooks, not module scope.
 *
 * This is the route-level guarantee. The `prerender.filter` in vite.config.ts
 * is the separate build-time one — see docs/adr/0003-spa-shell-and-prerender.md.
 */
export const Route = createFileRoute("/dnd")({
  ssr: false,
  component: DndLayout,
});

function DndLayout() {
  return <Outlet />;
}
