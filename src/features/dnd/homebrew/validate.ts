import type * as z from "zod";
import { CATALOG_SCHEMAS } from "@/features/dnd/catalog/schemas";
import type { CatalogEntry } from "@/features/dnd/db/schema";
import type { HomebrewType } from "@/features/dnd/homebrew/types";

/**
 * The one gate a homebrew entry passes through, whichever surface authored it.
 *
 * Homebrew conforms to the **same schema as a catalog entry** — that is what
 * makes it behave identically in derivation and creation. The forms and the
 * JSON editor are two ways of producing a value; both are validated here
 * against the same vendored schema, so a form cannot save something the JSON
 * editor would reject.
 *
 * There are deliberately **no balance or sanity checks**. Schema-valid is
 * valid; mechanical sanity is the table's business.
 */

/** One failure, addressed to the field that caused it. */
export type ValidationIssue = {
  /** A dotted path — `race.url`, `ability_bonuses.0.bonus` — or `(root)`. */
  path: string;
  message: string;
};

export type ValidationResult = { ok: true; entry: CatalogEntry } | { ok: false; issues: ValidationIssue[] };

/**
 * What an issue at the top level is labelled. A blank path renders as nothing
 * at all next to a message, which reads as an error belonging to whatever
 * field happens to be above it.
 */
const ROOT_PATH = "(root)";

/**
 * Zod's path array as the dotted string the editor shows. Array indices are
 * joined with a dot rather than bracketed, so one grammar covers both and the
 * value can be typed straight back into a search box.
 */
function formatPath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? ROOT_PATH : path.map(String).join(".");
}

function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({ path: formatPath(issue.path), message: issue.message }));
}

/**
 * Validates a candidate against its type's vendored schema.
 *
 * The parsed value is handed back rather than the input: the schema is what
 * decides the stored shape, and returning the input would store keys the
 * schema never saw.
 */
export function validateEntry(type: HomebrewType, value: unknown): ValidationResult {
  const schema = CATALOG_SCHEMAS[type];
  const result = schema.safeParse(value);

  if (!result.success) {
    return { ok: false, issues: toIssues(result.error) };
  }

  return { ok: true, entry: result.data as CatalogEntry };
}

/**
 * Text from the JSON editor, through the same gate. A syntax error comes back
 * as an ordinary issue at the root: the editor renders one error list, and a
 * thrown `SyntaxError` would need a second path through the UI to say the same
 * thing.
 */
export function parseHomebrewJson(type: HomebrewType, text: string): ValidationResult {
  if (text.trim() === "") {
    return { ok: false, issues: [{ path: ROOT_PATH, message: "Paste or write an entry first." }] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unparseable.";
    return { ok: false, issues: [{ path: ROOT_PATH, message: `Not valid JSON — ${detail}` }] };
  }

  return validateEntry(type, parsed);
}
