import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useCharacter } from "@/features/dnd/characters";
import { CharacterSheet } from "@/features/dnd/play";

/**
 * One character's sheet, in play mode — the surface used mid-combat. The six
 * tabs below it are [#164](https://github.com/Otisz/sheetcraft/issues/164).
 *
 * The not-found case is real rather than hypothetical: a bookmarked id survives
 * the character being deleted, and on a local-first app there is no server to
 * 404 for us.
 */
export const Route = createFileRoute("/dnd/$characterId")({ component: CharacterRoute });

function CharacterRoute() {
  const { characterId } = Route.useParams();
  const character = useCharacter(characterId);

  if (character.isPending) {
    return (
      <output aria-live="polite" className="flex min-h-dvh items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </output>
    );
  }

  if (character.isError || !character.data) {
    return <NotFound />;
  }

  return <CharacterSheet character={character.data} />;
}

function NotFound() {
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium">That character is not on this device.</p>
      <p className="max-w-prose text-sm text-muted-foreground">
        It may have been deleted, or saved in a different browser — characters never leave the device they were made on.
      </p>
      <Button render={<Link to="/dnd" />} nativeButton={false}>
        Back to characters
      </Button>
    </div>
  );
}
