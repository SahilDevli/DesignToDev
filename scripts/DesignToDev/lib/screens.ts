/**
 * lib/screens.ts — breakpoints and the device-name vocabulary.
 *
 * These only ever LABEL a design Figma already contains. Nothing here invents a
 * breakpoint: the responsive contract in both pipelines is design-driven, and
 * falls back to "make it responsive yourself" only when Figma has one width.
 */

import { normId } from "./io.js";

export interface Breakpoint {
  name: string;
  /** Reference width used to label a design by its actual size. */
  ref: number;
  media: string;
}

export const BREAKPOINTS: Breakpoint[] = [
  { name: "mobile", ref: 375, media: "(max-width: 767px)" },
  { name: "tablet", ref: 768, media: "(min-width: 768px) and (max-width: 1023px)" },
  { name: "laptop", ref: 1024, media: "(min-width: 1024px) and (max-width: 1439px)" },
  { name: "desktop", ref: 1440, media: "(min-width: 1440px) and (max-width: 1919px)" },
  { name: "large", ref: 1920, media: "(min-width: 1920px)" },
];

/** Viewport a component design belongs to when its own width says nothing. */
export const DESKTOP_VIEWPORT = 1440;

export function breakpointForWidth(width: number): Breakpoint {
  return BREAKPOINTS.reduce((best, bp) =>
    Math.abs(bp.ref - width) < Math.abs(best.ref - width) ? bp : best
  );
}

/** A variant property naming a screen size, e.g. "Screen=Mobile". */
export const SCREEN_PROP_RE = /^(screen|breakpoint|device|viewport|size|layout)$/i;

/** Device words — used to label a design and to strip a name to its base. */
export const DEVICE_WORDS: Array<{ re: RegExp; bp: string }> = [
  { re: /\b(mobile|phone|handset|xs|sm)\b/gi, bp: "mobile" },
  { re: /\b(tablet|ipad|md)\b/gi, bp: "tablet" },
  { re: /\b(laptop|notebook|lg)\b/gi, bp: "laptop" },
  { re: /\b(desktop|xl)\b/gi, bp: "desktop" },
  { re: /\b(large|wide|xxl|2xl|ultrawide)\b/gi, bp: "large" },
];

/**
 * "Home Page Mobile", "Home Page - Tablet" and "Home Page" all collapse to
 * "homepage" — which is how separate Figma nodes are recognised as alternate
 * screen designs of the same thing.
 */
export function baseKey(name: string): string {
  let s = name;
  for (const d of DEVICE_WORDS) {
    d.re.lastIndex = 0;
    s = s.replace(d.re, " ");
  }
  s = s.replace(/@\s*\d+\s*(px)?/gi, " "); // "Home Page @375"
  return normId(s);
}

/** The breakpoint a node name declares, if any. */
export function deviceFromName(name: string): Breakpoint | null {
  for (const d of DEVICE_WORDS) {
    d.re.lastIndex = 0;
    if (d.re.test(name)) return BREAKPOINTS.find((b) => b.name === d.bp) ?? null;
  }
  return null;
}
