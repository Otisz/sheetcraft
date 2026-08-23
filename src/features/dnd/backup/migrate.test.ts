import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "@/features/dnd/backup/format";
import { migrateCharacter } from "@/features/dnd/backup/migrate";

/**
 * The chain walk, proven before anything depends on it.
 *
 * `STEPS` is legitimately empty — the schema has not moved past version 1 — so
 * these drive the walk with an injected chain instead. ADR-0002 names the
 * import path as one where a bug silently destroys user data, and the first
 * real migration must not be the run that discovers the loop is wrong.
 */

const RECORD = { id: "c_1", name: "Bruenor", schemaVersion: 0 };

describe("migrateCharacter", () => {
  it("stamps the current version on a record that needs no steps", () => {
    expect(migrateCharacter(RECORD, CURRENT_SCHEMA_VERSION)).toMatchObject({
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
  });

  it("applies each step in order, from the file's version up to the target", () => {
    const order: number[] = [];
    const steps = {
      1: (record: Record<string, unknown>) => {
        order.push(1);
        return { ...record, one: true };
      },
      2: (record: Record<string, unknown>) => {
        order.push(2);
        return { ...record, two: true };
      },
    };

    const result = migrateCharacter({ ...RECORD }, 1, steps, 3) as Record<string, unknown>;

    expect(order).toEqual([1, 2]);
    expect(result.one).toBe(true);
    expect(result.two).toBe(true);
    expect(result.schemaVersion).toBe(3);
  });

  it("starts at the file's version, not at the beginning of the chain", () => {
    const order: number[] = [];
    const steps = {
      1: (record: Record<string, unknown>) => {
        order.push(1);
        return record;
      },
      2: (record: Record<string, unknown>) => {
        order.push(2);
        return record;
      },
    };

    migrateCharacter({ ...RECORD }, 2, steps, 3);

    // Step 1 belongs to a version this record is already past.
    expect(order).toEqual([2]);
  });

  it("skips a version with no step rather than failing", () => {
    // A schemaVersion bump that changed a table or an index has no work to do
    // to a character, and demanding a no-op per version makes the chain a
    // formality somebody fills with `(r) => r`.
    const steps = { 2: (record: Record<string, unknown>) => ({ ...record, two: true }) };

    const result = migrateCharacter({ ...RECORD }, 1, steps, 3) as Record<string, unknown>;

    expect(result.two).toBe(true);
    expect(result.schemaVersion).toBe(3);
  });

  it("never walks backwards for a record already at the target", () => {
    const steps = {
      1: () => {
        throw new Error("must not run");
      },
    };

    expect(() => migrateCharacter({ ...RECORD }, 5, steps, 3)).not.toThrow();
  });

  it("passes a non-object through untouched", () => {
    expect(migrateCharacter(null, 0)).toBeNull();
    expect(migrateCharacter("not a record", 0)).toBe("not a record");
  });
});
