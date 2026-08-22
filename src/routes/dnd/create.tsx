import { createFileRoute } from "@tanstack/react-router";
import { CreateCharacterForm } from "@/features/dnd/creation";

/**
 * Character creation. Client-only by inheritance from the `/dnd` layout, and
 * rendered only once the sync gate above it has installed tier 1 — the
 * pickers read the catalog directly, so an ungated render would show empty
 * lists. See CONTEXT.md § Sync gate.
 */
export const Route = createFileRoute("/dnd/create")({ component: CreateCharacter });

function CreateCharacter() {
  return <CreateCharacterForm />;
}
