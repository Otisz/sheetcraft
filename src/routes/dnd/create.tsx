import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/**
 * Character creation. A placeholder so the list's primary action has somewhere
 * to go — the flow itself is
 * [#162](https://github.com/Otisz/sheetcraft/issues/162).
 */
export const Route = createFileRoute("/dnd/create")({ component: CreateCharacter });

function CreateCharacter() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">New character</h1>
      <p className="max-w-prose text-sm text-muted-foreground">Creation lands with the next ticket.</p>
      <Button render={<Link to="/dnd" />} nativeButton={false} variant="outline">
        Back to characters
      </Button>
    </div>
  );
}
