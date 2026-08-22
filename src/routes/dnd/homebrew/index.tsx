import { createFileRoute } from "@tanstack/react-router";
import { HomebrewList } from "@/features/dnd/homebrew";

/**
 * The homebrew library. Client-only by inheritance from the `/dnd` layout —
 * it reads the homebrew tables, which live in IndexedDB.
 */
export const Route = createFileRoute("/dnd/homebrew/")({ component: Homebrew });

function Homebrew() {
  return <HomebrewList />;
}
