/**
 * Catalog + homebrew content, as the pickers see it.
 *
 * Exists because character creation and homebrew authoring both need "choose a
 * race" and neither owns it — a picker living in `creation` and imported by
 * `homebrew` (and back again, for the type it authors) was a cycle between two
 * features. Bulletproof React's rule is that features do not import from other
 * features; what two features share moves out to a module they both sit above.
 */

export { FieldError } from "@/features/dnd/content/field-error";
export type { PickerOption } from "@/features/dnd/content/options";
export {
  loadClassOptions,
  loadRaceOptions,
  loadSubclassOptions,
  loadSubraceOptions,
} from "@/features/dnd/content/options";
export type { PickerFieldProps } from "@/features/dnd/content/picker-field";
export { PickerField } from "@/features/dnd/content/picker-field";
export {
  contentKeys,
  useClassOptions,
  useRaceOptions,
  useSubclassOptions,
  useSubraceOptions,
} from "@/features/dnd/content/queries";
