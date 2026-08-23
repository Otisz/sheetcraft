import type * as z from "zod";
import { CATALOG_SCHEMAS } from "@/features/dnd/catalog/schemas";
import type { CatalogEntry } from "@/features/dnd/db/schema";
import { validateEntryModifiers } from "@/features/dnd/homebrew/entry-modifiers";
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
 *
 * Two keys are **side-cars**, stored on the row and outside that schema:
 * `updatedAt` and `modifiers`. `stripSideCar` below is the one place the split
 * is made, and everything that validates a row goes through it — which is what
 * keeps the vendored schemas strict while an entry still carries what it does
 * to a character. See ADR-0006.
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
/**
 * The side-car keys — everything stored on a homebrew row that the vendored
 * schema does not declare.
 *
 * Listed once, here, because three callers strip them and a fourth would
 * otherwise strip only the one it happened to know about. The failure is
 * silent in the direction that matters: a `modifiers` key left on the value
 * fails the strict schema as an unknown key, which reads as the ENTRY being
 * broken rather than as the validator being handed the wrong half of a row.
 */
const SIDE_CAR_KEYS = ["updatedAt", "modifiers"] as const;

/**
 * A stored row split into the half the vendored schema owns and the half it
 * does not.
 *
 * Named and exported rather than inlined as a destructure, because "which keys
 * are not catalog data" is the load-bearing claim of ADR-0006 and it should be
 * answerable in one place rather than reconstructed from three spread
 * expressions.
 */
export function stripSideCar(value: unknown): { payload: unknown; sideCar: Record<string, unknown> } {
  // A non-object is handed through UNCHANGED rather than normalised to `{}`.
  // The schema is what says "expected object, received string", and a value
  // replaced by an empty object here would arrive as six missing-field issues
  // instead — six symptoms of one problem, none of them naming it.
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { payload: value, sideCar: {} };
  }

  const payload: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  const sideCar: Record<string, unknown> = {};

  for (const key of SIDE_CAR_KEYS) {
    if (Object.hasOwn(payload, key)) {
      sideCar[key] = payload[key];
      delete payload[key];
    }
  }

  return { payload, sideCar };
}

/**
 * Validates a candidate against its type's vendored schema.
 *
 * The parsed value is handed back rather than the input: the schema is what
 * decides the stored shape, and returning the input would store keys the
 * schema never saw.
 *
 * The side-car is removed BEFORE the parse and validated separately, so the
 * strict schema never sees a key it would reject and `modifiers` still cannot
 * be saved malformed. Its issues are merged into the one list the editor
 * renders, under the `modifiers.<n>.<field>` paths `validateEntryModifiers`
 * produces — one grammar, whichever half of the row the problem was in.
 */
export function validateEntry(type: HomebrewType, value: unknown): ValidationResult {
  const { payload, sideCar } = stripSideCar(value);
  const schema = CATALOG_SCHEMAS[type];
  const result = schema.safeParse(payload);
  const modifierIssues = validateEntryModifiers(sideCar.modifiers);

  if (!result.success) {
    return { ok: false, issues: [...toIssues(result.error), ...modifierIssues] };
  }

  if (modifierIssues.length > 0) {
    return { ok: false, issues: modifierIssues };
  }

  // The side-car is put back on the parsed payload rather than left behind:
  // the caller stores what comes out of here, and a validator that silently
  // dropped the records would make authoring them impossible in exactly the
  // way this ticket exists to fix.
  const entry = { ...result.data, ...sideCar } as CatalogEntry;
  return { ok: true, entry };
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
