/**
 * Phased modifier resolution: `override (short-circuit) → set → add → min → max`.
 *
 * The phasing is what makes the result independent of record order, and record
 * order is not something the player controls — modifiers arrive from race,
 * class, equipment and homebrew in whatever sequence they were added. A result
 * that depended on it would be a result nobody could explain.
 *
 * Pure: no Dexie, no React, no network. See CONTEXT.md § Derivation.
 */
import type { Modifier } from "@/features/dnd/db/schema";

/** One applied modifier, and the running value after it. Powers "why is my AC 17?". */
export type Step = {
  id: string;
  source: string;
  label: string;
  op: Modifier["op"];
  /** The resolved number — a `{ref}` value appears here as what it resolved to. */
  amount: number;
  /** The running value after this step. */
  value: number;
};

/** A derived value together with the reasoning that produced it. */
export type Trace = {
  value: number;
  base: number;
  steps: Step[];
};

/** The phases, in resolution order. `override` is handled before any of them. */
const PHASES = ["set", "add", "min", "max"] as const;

const APPLY: Record<Modifier["op"], (running: number, amount: number) => number> = {
  set: (_running, amount) => amount,
  add: (running, amount) => running + amount,
  min: (running, amount) => Math.max(running, amount),
  max: (running, amount) => Math.min(running, amount),
};

/**
 * A modifier whose `value` has already been resolved to a number. Resolution
 * happens in the caller because it needs the derived values a `{ref}` points
 * at, which this module deliberately knows nothing about.
 */
export type ResolvedModifier = Omit<Modifier, "value"> & { amount: number };

/**
 * Applies the enabled modifiers to a base value and reports how.
 *
 * `min`/`max` name the floor and the ceiling, following the SRD's own reading
 * of "your AC can't be less than 12" — so `op:'min'` raises the value to at
 * least its amount, which is `Math.max` arithmetically.
 */
export function resolve(base: number, modifiers: ResolvedModifier[]): Trace {
  const enabled = modifiers.filter((modifier) => modifier.enabled);

  // An override replaces the value outright, so nothing else is even consulted.
  // Last one wins: a second override is the player changing their mind.
  const overrides = enabled.filter((modifier) => modifier.source === "override");
  if (overrides.length > 0) {
    const winner = overrides[overrides.length - 1];
    return {
      base,
      value: winner.amount,
      steps: [stepFrom(winner, winner.amount)],
    };
  }

  const steps: Step[] = [];
  let value = base;

  for (const phase of PHASES) {
    for (const modifier of enabled) {
      if (modifier.op !== phase) {
        continue;
      }
      value = APPLY[phase](value, modifier.amount);
      steps.push(stepFrom(modifier, value));
    }
  }

  return { base, value, steps };
}

function stepFrom(modifier: ResolvedModifier, value: number): Step {
  return {
    id: modifier.id,
    source: modifier.source,
    label: modifier.label,
    op: modifier.op,
    amount: modifier.amount,
    value,
  };
}
