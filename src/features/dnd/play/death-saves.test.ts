import { describe, expect, it } from "vitest";
import {
  DEATH_SAVE_INDEXES,
  type DeathSaves,
  deathSaveOutcome,
  NO_DEATH_SAVES,
  toggleDeathSave,
} from "@/features/dnd/play/death-saves";

/**
 * PHB p.197: three successes stabilise, three failures kill. The pip *gesture*
 * is not in the rulebook — it is this app's, so it is pinned here rather than
 * transcribed.
 */

const CLEAR: DeathSaves = NO_DEATH_SAVES;

describe("toggleDeathSave", () => {
  it("fills up to the tapped pip", () => {
    expect(toggleDeathSave(CLEAR, "successes", 2)).toEqual({ successes: 2, failures: 0 });
  });

  it("fills the whole row when the last pip is tapped from clear", () => {
    expect(toggleDeathSave(CLEAR, "failures", 3)).toEqual({ successes: 0, failures: 3 });
  });

  it("clears back down when a pip below the top filled one is tapped", () => {
    expect(toggleDeathSave({ successes: 3, failures: 0 }, "successes", 1)).toEqual({ successes: 1, failures: 0 });
  });

  it("clears the top filled pip when it is tapped again — a mis-tap is undone by repeating it", () => {
    expect(toggleDeathSave({ successes: 2, failures: 0 }, "successes", 2)).toEqual({ successes: 1, failures: 0 });
  });

  it("empties the row when the only filled pip is tapped", () => {
    expect(toggleDeathSave({ successes: 1, failures: 0 }, "successes", 1)).toEqual({ successes: 0, failures: 0 });
  });

  it("moves one row without disturbing the other", () => {
    expect(toggleDeathSave({ successes: 2, failures: 1 }, "failures", 3)).toEqual({ successes: 2, failures: 3 });
  });

  it("ignores a pip index outside the row", () => {
    expect(toggleDeathSave({ successes: 1, failures: 0 }, "successes", 0)).toEqual({ successes: 1, failures: 0 });
    expect(toggleDeathSave({ successes: 1, failures: 0 }, "successes", 4)).toEqual({ successes: 1, failures: 0 });
    expect(toggleDeathSave({ successes: 1, failures: 0 }, "successes", 1.5)).toEqual({ successes: 1, failures: 0 });
  });

  it("round-trips every pip: filling then re-tapping leaves one fewer", () => {
    for (const index of DEATH_SAVE_INDEXES) {
      const filled = toggleDeathSave(CLEAR, "successes", index);
      expect(filled.successes).toBe(index);
      expect(toggleDeathSave(filled, "successes", index).successes).toBe(index - 1);
    }
  });
});

describe("deathSaveOutcome", () => {
  it("is unresolved while either row is short of three", () => {
    expect(deathSaveOutcome(CLEAR)).toBeNull();
    expect(deathSaveOutcome({ successes: 2, failures: 2 })).toBeNull();
  });

  it("is stable at three successes", () => {
    expect(deathSaveOutcome({ successes: 3, failures: 2 })).toBe("stable");
  });

  it("is dead at three failures", () => {
    expect(deathSaveOutcome({ successes: 2, failures: 3 })).toBe("dead");
  });

  it("reports dead when a mis-tap has filled both rows", () => {
    expect(deathSaveOutcome({ successes: 3, failures: 3 })).toBe("dead");
  });
});
