import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/games")({ component: Games });

function Games() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold">Games</h1>
      <p className="mt-4 text-lg">D&amp;D 2014 is the only game in the MVP.</p>
    </div>
  );
}
