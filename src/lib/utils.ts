import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A full-width, thumb-height control — the shape every form field on every
 * page takes. Declared once because it had reached three verbatim copies
 * across creation and homebrew authoring.
 */
export const THUMB_CONTROL = "h-12 w-full";

/**
 * The same shape as an ACTION rather than a field: a drawer button, or a
 * primary mobile action. Built from `THUMB_CONTROL` so the two cannot drift
 * apart in height, which is the thing that makes a column of them look wrong.
 */
export const THUMB_ACTION = `${THUMB_CONTROL} text-base`;
