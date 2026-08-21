import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { HARNESS_MARKER } from "@/lib/harness-marker";

describe("test harness", () => {
  it("runs a trivial test", () => {
    expect(1 + 1).toBe(2);
  });

  it("resolves imports through the @/ alias", () => {
    expect(HARNESS_MARKER).toBe("sheetcraft");
  });

  it("opens a Dexie database without injecting an IDBFactory", async () => {
    const db = new Dexie("harness");
    db.version(1).stores({ rows: "id" });

    await db.open();
    expect(db.isOpen()).toBe(true);

    await db.table("rows").bulkPut([{ id: "a" }, { id: "b" }]);
    await expect(db.table("rows").count()).resolves.toBe(2);

    db.close();
    await db.delete();
  });
});
