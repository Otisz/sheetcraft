import { createFileRoute, Navigate } from "@tanstack/react-router";
import { HomebrewEditor, isHomebrewType } from "@/features/dnd/homebrew";

/**
 * Authoring a new entry of one type.
 *
 * The type comes out of the URL as a bare string, so it is narrowed before it
 * reaches anything that indexes a table with it — a hand-typed
 * `/dnd/homebrew/new/wombat` redirects rather than rendering a form over a
 * table that does not exist.
 */
export const Route = createFileRoute("/dnd/homebrew/new/$type")({ component: NewEntry });

function NewEntry() {
  const { type } = Route.useParams();

  if (!isHomebrewType(type)) {
    return <Navigate to="/dnd/homebrew" replace />;
  }

  return <HomebrewEditor type={type} />;
}
