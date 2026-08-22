import { describe, expect, it } from "vitest";
import { applyDamage, applyHeal, applyTempHp, hpStatus } from "@/features/dnd/play/hp";

/**
 * Expected values transcribed from PHB pp.196–198, not computed by the code
 * under test. The three rules doing the work:
 *
 * - "Temporary hit points … are lost first" (p.198)
 * - "When damage reduces you to 0 hit points … you die or fall unconscious" —
 *   damage below 0 does not carry into negatives on the sheet (p.197)
 * - "Temporary hit points … don't add together. If you have temporary hit
 *   points and receive more, you decide whether to keep them" — the higher
 *   pool wins here, which is that decision made for the common case (p.198)
 */

/** A pool at full health, for tests to spread over. */
const FULL = { currentHp: 41, tempHp: 0 } as const;

describe("applyDamage", () => {
  it("subtracts from current hp when there is no temp hp", () => {
    expect(applyDamage(FULL, 12, 82)).toEqual({ currentHp: 29, tempHp: 0 });
  });

  it("consumes temp hp before current hp", () => {
    expect(applyDamage({ currentHp: 41, tempHp: 5 }, 3, 82)).toEqual({ currentHp: 41, tempHp: 2 });
  });

  it("spills the remainder into current hp once temp hp is exhausted", () => {
    expect(applyDamage({ currentHp: 41, tempHp: 5 }, 12, 82)).toEqual({ currentHp: 34, tempHp: 0 });
  });

  it("exhausts temp hp exactly without touching current hp", () => {
    expect(applyDamage({ currentHp: 41, tempHp: 5 }, 5, 82)).toEqual({ currentHp: 41, tempHp: 0 });
  });

  it("floors current hp at 0 rather than going negative", () => {
    expect(applyDamage({ currentHp: 4, tempHp: 0 }, 30, 82)).toEqual({ currentHp: 0, tempHp: 0 });
  });

  it("floors at 0 through temp hp too", () => {
    expect(applyDamage({ currentHp: 4, tempHp: 5 }, 30, 82)).toEqual({ currentHp: 0, tempHp: 0 });
  });

  it("ignores a non-positive amount", () => {
    expect(applyDamage({ currentHp: 41, tempHp: 5 }, 0, 82)).toEqual({ currentHp: 41, tempHp: 5 });
    expect(applyDamage({ currentHp: 41, tempHp: 5 }, -3, 82)).toEqual({ currentHp: 41, tempHp: 5 });
  });
});

describe("applyHeal", () => {
  it("adds to current hp", () => {
    expect(applyHeal({ currentHp: 41, tempHp: 0 }, 10, 82)).toEqual({ currentHp: 51, tempHp: 0 });
  });

  it("caps at max hp", () => {
    expect(applyHeal({ currentHp: 78, tempHp: 0 }, 20, 82)).toEqual({ currentHp: 82, tempHp: 0 });
  });

  it("does not touch temp hp — healing never restores a temp pool", () => {
    expect(applyHeal({ currentHp: 20, tempHp: 4 }, 10, 82)).toEqual({ currentHp: 30, tempHp: 4 });
  });

  it("brings a downed character back from 0", () => {
    expect(applyHeal({ currentHp: 0, tempHp: 0 }, 1, 82)).toEqual({ currentHp: 1, tempHp: 0 });
  });

  it("ignores a non-positive amount", () => {
    expect(applyHeal({ currentHp: 41, tempHp: 0 }, 0, 82)).toEqual({ currentHp: 41, tempHp: 0 });
    expect(applyHeal({ currentHp: 41, tempHp: 0 }, -5, 82)).toEqual({ currentHp: 41, tempHp: 0 });
  });
});

describe("applyTempHp", () => {
  it("sets the temp pool when there is none", () => {
    expect(applyTempHp({ currentHp: 41, tempHp: 0 }, 5, 82)).toEqual({ currentHp: 41, tempHp: 5 });
  });

  it("keeps the larger pool rather than adding — temp hp never stacks", () => {
    expect(applyTempHp({ currentHp: 41, tempHp: 8 }, 5, 82)).toEqual({ currentHp: 41, tempHp: 8 });
    expect(applyTempHp({ currentHp: 41, tempHp: 3 }, 5, 82)).toEqual({ currentHp: 41, tempHp: 5 });
  });

  it("is not capped by max hp — a temp pool sits on top of it", () => {
    expect(applyTempHp({ currentHp: 82, tempHp: 0 }, 20, 82)).toEqual({ currentHp: 82, tempHp: 20 });
  });

  it("clears the pool on 0, which is how a player drops temp hp", () => {
    expect(applyTempHp({ currentHp: 41, tempHp: 8 }, 0, 82)).toEqual({ currentHp: 41, tempHp: 0 });
  });

  it("ignores a negative amount", () => {
    expect(applyTempHp({ currentHp: 41, tempHp: 8 }, -5, 82)).toEqual({ currentHp: 41, tempHp: 8 });
  });
});

describe("hpStatus", () => {
  it("is `down` at 0 hp, which is what swaps in the death saves", () => {
    expect(hpStatus({ currentHp: 0, tempHp: 0 }, 82)).toBe("down");
  });

  it("is `bloodied` at or below half of max", () => {
    expect(hpStatus({ currentHp: 41, tempHp: 0 }, 82)).toBe("bloodied");
    expect(hpStatus({ currentHp: 42, tempHp: 0 }, 82)).toBe("healthy");
  });

  it("is `healthy` above half", () => {
    expect(hpStatus({ currentHp: 82, tempHp: 0 }, 82)).toBe("healthy");
  });

  it("reads current hp only — a temp pool does not lift you off the floor", () => {
    expect(hpStatus({ currentHp: 0, tempHp: 9 }, 82)).toBe("down");
  });
});
