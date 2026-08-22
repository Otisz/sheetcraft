import { createFileRoute, Navigate } from "@tanstack/react-router";
import { HomebrewEditor, isHomebrewType } from "@/features/dnd/homebrew";

/**
 * Editing one existing entry. Both segments come out of the URL as bare
 * strings; the type is narrowed here, and a missing entry is the editor's own
 * "not here" state rather than a redirect — a bookmark that silently bounces
 * looks like the app losing the entry.
 */
export const Route = createFileRoute("/dnd/homebrew/$type/$index")({ component: EditEntry });

function EditEntry() {
  const { type, index } = Route.useParams();

  if (!isHomebrewType(type)) {
    return <Navigate to="/dnd/homebrew" replace />;
  }

  return <HomebrewEditor type={type} index={index} />;
}
