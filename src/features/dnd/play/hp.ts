/**
 * The hit point arithmetic behind the HP row and the numpad drawer.
 *
 * Pure, and separated from the UI on purpose: this is the one part of play
 * mode that is wrong *silently*. A stepper that renders badly is obvious; temp
 * HP absorbed in the wrong order is a number nobody notices until the wrong
 * character is unconscious. See ADR-0002 § TDD.
 *
 * Every function takes the pool and returns a new one — no mutation, so a
 * caller can preview a commit without performing it, which is exactly what the
 * numpad's `damage → 18 · heal → 28` line does.
 */

/** The mutable half of hit points: what the record's `play` carries. */
export type HpPool = {
  currentHp: number;
  tempHp: number;
};

/**
 * How healthy the pool reads, for the health bar. Three states rather than a
 * raw ratio because the bar's job is a glance, not a measurement.
 */
export type HpStatus = "healthy" | "bloodied" | "down";

/**
 * Guards every entry point. The numpad can hand over an empty entry, and a
 * stepper at the floor can hand over a no-op; neither is an error, both are
 * "nothing happens".
 */
function isPositive(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}

/**
 * Damage, temp HP first. PHB p.198: temporary hit points "are lost first, and
 * any leftover damage carries over to your normal hit point total."
 *
 * Current HP floors at 0. The 2014 rules track damage past 0 only for the
 * instant-death threshold, which needs the damage amount rather than a stored
 * negative — so a negative total here would be a number the sheet could not
 * use and the player could not read.
 */
export function applyDamage(pool: HpPool, amount: number, _maxHp: number): HpPool {
  if (!isPositive(amount)) {
    return pool;
  }

  const absorbed = Math.min(pool.tempHp, amount);
  const remainder = amount - absorbed;

  return {
    currentHp: Math.max(0, pool.currentHp - remainder),
    tempHp: pool.tempHp - absorbed,
  };
}

/**
 * Healing, capped at max HP and never touching the temp pool — temp HP is
 * granted by a specific effect, so healing cannot restore it (PHB p.198).
 *
 * Healing a character at 0 is what returns the sheet from death saves to the
 * HP view. Resetting the pips is the *caller's* job, not this function's: the
 * pips live in `deathSaves`, not in the pool, and folding them in here would
 * make a pure HP function reach into an unrelated part of the record. The
 * death-save panel's own "Heal 1 HP" does both in one write.
 */
export function applyHeal(pool: HpPool, amount: number, maxHp: number): HpPool {
  if (!isPositive(amount)) {
    return pool;
  }

  return { ...pool, currentHp: Math.min(maxHp, pool.currentHp + amount) };
}

/**
 * Grants temporary hit points. PHB p.198: they "don't add together" — offered
 * a second pool, the player chooses one. Taking the larger is that choice made
 * for the case that is always right; a player wanting the smaller can set 0
 * first, which is also how the pool is cleared.
 *
 * Not capped by max HP: a temp pool sits on top of the maximum by definition.
 */
export function applyTempHp(pool: HpPool, amount: number, _maxHp: number): HpPool {
  if (!Number.isFinite(amount) || amount < 0) {
    return pool;
  }

  // 0 is a deliberate clear rather than a no-op, so it is handled before the
  // larger-pool-wins rule that would otherwise discard it.
  if (amount === 0) {
    return { ...pool, tempHp: 0 };
  }

  return { ...pool, tempHp: Math.max(pool.tempHp, amount) };
}

/** Half of max, rounded down, is the "bloodied" line most tables use. */
export function hpStatus(pool: HpPool, maxHp: number): HpStatus {
  if (pool.currentHp <= 0) {
    return "down";
  }
  // Current HP only: a temp pool is not health, and a downed character holding
  // temp HP is still downed.
  return pool.currentHp <= Math.floor(maxHp / 2) ? "bloodied" : "healthy";
}

/** The three commits the numpad offers. Its bottom row IS this union. */
export type HpCommit = "damage" | "heal" | "temp";

/**
 * One entry point for the numpad, so the component switches on nothing. Adding
 * a fourth commit means adding it here, not in a component's conditional.
 */
export function applyHpCommit(commit: HpCommit, pool: HpPool, amount: number, maxHp: number): HpPool {
  if (commit === "damage") {
    return applyDamage(pool, amount, maxHp);
  }
  if (commit === "heal") {
    return applyHeal(pool, amount, maxHp);
  }
  return applyTempHp(pool, amount, maxHp);
}

/**
 * Whether committing this entry would do nothing at all, which is what
 * disables a commit button.
 *
 * Lives here beside `applyHpCommit` rather than in the numpad: it is the same
 * three-way rule read the other way round, and a component holding half of it
 * is how the two drift apart. Takes the raw entry string because the
 * distinction it turns on — a typed `"0"` versus an empty box — is lost once
 * the entry becomes a number.
 */
export function isNoOpCommit(commit: HpCommit, entry: string): boolean {
  if (entry === "") {
    return true;
  }
  // Temp accepts a typed 0: `applyTempHp(_, 0)` is how a player drops a temp
  // pool, so it is a real action. Damage and heal of 0 are not.
  return Number(entry) === 0 && commit !== "temp";
}
