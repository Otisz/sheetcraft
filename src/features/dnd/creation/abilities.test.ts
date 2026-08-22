import { describe, expect, it } from "vitest";
import {
  abilityMethodDefaults,
  isArrayComplete,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  pointBuySpent,
  STANDARD_ARRAY,
  standardArrayScores,
} from "@/features/dnd/creation/abilities";
import { ABILITIES } from "@/features/dnd/db/schema";

/**
 * Every expected value here is transcribed from the PHB (p.13), not computed
 * by the code under test: the standard array is 15/14/13/12/10/8, point buy
 * runs 8–15 on a budget of 27, and the cost table is 8:0 9:1 10:2 11:3 12:4
 * 13:5 14:7 15:9. See ADR-0002 § Fixtures.
 */

describe("point buy cost table", () => {
  it.each([
    [8, 0],
    [9, 1],
    [10, 2],
    [11, 3],
    [12, 4],
    [13, 5],
    [14, 7],
    [15, 9],
  ])("costs %i points for a score of %i", (score, cost) => {
    expect(POINT_BUY_COST[score]).toBe(cost);
  });

  it("spans exactly 8 to 15 — the PHB range, no more", () => {
    expect(
      Object.keys(POINT_BUY_COST)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(POINT_BUY_MIN).toBe(8);
    expect(POINT_BUY_MAX).toBe(15);
  });

  it("budgets 27 points", () => {
    expect(POINT_BUY_BUDGET).toBe(27);
  });
});

describe("pointBuySpent", () => {
  it("spends nothing on the all-8s starting spread", () => {
    expect(pointBuySpent({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBe(0);
  });

  it("spends exactly the full 27 on 15/14/13/12/10/8", () => {
    expect(pointBuySpent({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 })).toBe(POINT_BUY_BUDGET);
  });

  it("counts a score outside the table as unaffordable rather than free", () => {
    expect(pointBuySpent({ str: 18, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBeGreaterThan(POINT_BUY_BUDGET);
  });
});

describe("standard array", () => {
  it("is 15/14/13/12/10/8", () => {
    expect(STANDARD_ARRAY).toEqual([15, 14, 13, 12, 10, 8]);
  });

  it("costs exactly 27 under point buy — the two methods agree", () => {
    expect(STANDARD_ARRAY.reduce((sum, score) => sum + POINT_BUY_COST[score], 0)).toBe(POINT_BUY_BUDGET);
  });
});

describe("isArrayComplete", () => {
  it("accepts an assignment using each value exactly once", () => {
    expect(isArrayComplete({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 })).toBe(true);
  });

  it("rejects an assignment that reuses a value and drops another", () => {
    expect(isArrayComplete({ str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 })).toBe(false);
  });

  it("rejects an assignment with an unassigned slot", () => {
    expect(isArrayComplete({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: null })).toBe(false);
  });
});

describe("standardArrayScores", () => {
  it("reads a complete assignment straight through", () => {
    const assignment = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
    expect(standardArrayScores(assignment)).toEqual(assignment);
  });

  it("returns null for an incomplete assignment rather than inventing a score", () => {
    expect(standardArrayScores({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: null })).toBeNull();
  });
});

describe("abilityMethodDefaults", () => {
  it("starts point buy at all 8s — the affordable floor, not a clamp of what came before", () => {
    expect(abilityMethodDefaults("point-buy")).toEqual({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
  });

  it("starts manual at all 10s", () => {
    expect(abilityMethodDefaults("manual")).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
  });

  it("starts the standard array unassigned, so every value is still on the table", () => {
    expect(abilityMethodDefaults("standard-array")).toEqual({
      str: null,
      dex: null,
      con: null,
      int: null,
      wis: null,
      cha: null,
    });
  });

  it("covers all six abilities for every method", () => {
    for (const method of ["manual", "standard-array", "point-buy"] as const) {
      expect(Object.keys(abilityMethodDefaults(method)).sort()).toEqual([...ABILITIES].sort());
    }
  });
});
