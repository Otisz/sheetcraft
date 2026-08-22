import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A full-width, thumb-height action — the shape every drawer button and every
 * primary mobile action takes. Declared once because it had reached four
 * verbatim copies across the sheet and the character list.
 */
export const THUMB_ACTION = "h-12 w-full text-base";
