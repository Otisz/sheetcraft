import { createFileRoute } from "@tanstack/react-router";
import { CharacterList } from "@/features/dnd/characters";

/**
 * The character list. Client-only by inheritance from the `/dnd` layout, and
 * rendered only once the sync gate above it has installed tier 1.
 */
export const Route = createFileRoute("/dnd/")({ component: DndHome });

function DndHome() {
  return <CharacterList />;
}
