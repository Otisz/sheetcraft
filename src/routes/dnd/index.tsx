import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dnd/")({ component: DndHome });

function DndHome() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold">D&amp;D 2014</h1>
      <p className="mt-4 text-lg">Your characters live here.</p>
    </div>
  );
}
