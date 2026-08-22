import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCharacter } from "@/features/dnd/characters";

/**
 * One character. This ticket only opens it — the sheet itself is
 * [#163](https://github.com/Otisz/sheetcraft/issues/163) (play mode) and
 * [#164](https://github.com/Otisz/sheetcraft/issues/164) (the six tabs).
 *
 * What it does carry now is the not-found case, which is real rather than
 * hypothetical: a bookmarked id survives the character being deleted, and on a
 * local-first app there is no server to 404 for us.
 */
export const Route = createFileRoute("/dnd/$characterId")({ component: CharacterSheet });

function CharacterSheet() {
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <BackLink />
      <h1 className="text-2xl font-bold">{character.data.name}</h1>
      <p className="text-sm text-muted-foreground">Level {character.data.level}</p>
      <p className="text-sm text-muted-foreground">The sheet itself lands with the next tickets.</p>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/dnd" className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground">
      <ChevronLeft className="size-4" />
      Characters
    </Link>
  );
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
