import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The engine is pure by contract, not just by current implementation. An
 * import of Dexie or React here would make derivation untestable against
 * transcribed rulebook values and un-runnable off the main thread — so the
 * boundary is asserted rather than assumed. See ADR-0002.
 */
const ENGINE_DIR = join(import.meta.dirname, ".");

const FORBIDDEN = [
  { pattern: /from\s+["']dexie["']/, reason: "Dexie" },
  { pattern: /from\s+["']react/, reason: "React" },
  { pattern: /@\/features\/dnd\/db\/db/, reason: "the Dexie database module" },
  { pattern: /\bfetch\s*\(/, reason: "network access" },
  { pattern: /\bDate\.now\s*\(|new Date\s*\(\s*\)/, reason: "the clock" },
  { pattern: /\bMath\.random\s*\(/, reason: "randomness" },
];

async function engineSources(): Promise<string[]> {
  const entries = await readdir(ENGINE_DIR);
  return entries.filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"));
}

describe("purity", () => {
  it("has sources to check", async () => {
    await expect(engineSources()).resolves.not.toHaveLength(0);
  });

  it.each(FORBIDDEN)("imports nothing from $reason", async ({ pattern, reason }) => {
    for (const file of await engineSources()) {
      const source = await readFile(join(ENGINE_DIR, file), "utf8");

      expect(source, `${file} reaches for ${reason}`).not.toMatch(pattern);
    }
  });

  it("imports only types from the schema module, which is types-only anyway", async () => {
    for (const file of await engineSources()) {
      const source = await readFile(join(ENGINE_DIR, file), "utf8");
      const schemaImports = source.match(/^import\s+(.+?)\s+from\s+["']@\/features\/dnd\/db\/schema["'];$/gm) ?? [];

      for (const statement of schemaImports) {
        // `ABILITIES` is the one value crossing this line — a frozen const array.
        expect(statement).toMatch(/\btype\b|ABILITIES/);
      }
    }
  });
});
