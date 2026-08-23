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
