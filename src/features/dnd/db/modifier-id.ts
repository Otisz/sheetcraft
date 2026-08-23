import type { Modifier } from "@/features/dnd/db/schema";

/**
 * How a modifier record's id is derived.
 *
 * **From its source and target, never randomly generated.** Two things depend
 * on that, and both are load-bearing:
 *
 * - The same input produces the same record every time, so a re-derivation is
 *   not mistaken for a change and these records stay testable by equality.
 * - It gives a re-derivation a stable key to merge on — which is what lets
 *   `syncFeatureModifiers` carry the player's `enabled` flag across a class or
 *   level change rather than resetting every toggle.
 *
 * Lives here rather than in either caller because the racial bonuses and the
 * feature map had already written the same rule, and the same rule written
 * twice is one that drifts.
 */
export function modifierId(source: string, target: string): string {
  return `${source}:${target}`;
}

/**
 * Re-derives one group of modifier records on a character — a **merge, not a
 * replace**.
 *
 * `owns` says which of the character's existing records this re-derivation is
 * responsible for; everything it does not claim is passed through untouched.
 * Three rules follow, and each one is a bug avoided:
 *
 * - **The toggle survives.** `enabled` is the player's flag and a
 *   re-derivation is not a player action. A barbarian who levels to 3 must not
 *   find Unarmored Defense switched back off, and an author fixing a typo in a
 *   label must not switch an effect back on that the player turned off.
 * - **Records the source no longer produces go.** A class change takes its
 *   features with it and a deleted authored record disappears everywhere — a
 *   record left behind is a number nothing on the sheet can explain.
 * - **Everything else is untouched.** Racial bonuses, equipment, overrides and
 *   other entries' records share the list and none of them is any one
 *   re-derivation's business.
 *
 * Lives beside `modifierId` for that function's own reason: the feature map and
 * the homebrew side-car had both written this merge, and the same rule written
 * twice is one that drifts. It works only because the ids are derived rather
 * than generated, which is what gives the merge a stable key.
 */
export function mergeModifiers(
  modifiers: readonly Modifier[],
  owns: (modifier: Modifier) => boolean,
  derived: readonly Modifier[],
): Modifier[] {
  const enabledBefore = new Map(modifiers.filter(owns).map((one) => [one.id, one.enabled]));

  const kept = modifiers.filter((one) => !owns(one));
  const rederived = derived.map((one) => ({ ...one, enabled: enabledBefore.get(one.id) ?? one.enabled }));

  return [...kept, ...rederived];
}
