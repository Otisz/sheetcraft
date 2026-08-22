import type { CreateCharacterInput } from "@/features/dnd/db/characters-repository";

/**
 * The shared character fixture. One literal rather than a copy per test file,
 * so a schema change breaks compilation in one place instead of drifting
 * between suites. See ADR-0002 § Fixtures.
 */
export const FIGHTER: CreateCharacterInput = {
  name: "Bruenor",
  level: 4,
  classRef: "catalog:fighter",
  raceRef: "catalog:dwarf",
};
