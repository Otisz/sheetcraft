import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * The `/dnd` layout route. Ships via the SPA shell rather than being
 * prerendered — everything below it is client-only, reading from Dexie.
 * This is where the sync gate will live.
 */
export const Route = createFileRoute("/dnd")({ component: DndLayout });

function DndLayout() {
  return <Outlet />;
}
