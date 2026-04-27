import path from "path";

let canvasGuardDone = false;

/**
 * Hint string for text-width heuristics (`measureLineWidthPx`); SVG output uses paths, not this family.
 */
export const SHARP_SVG_FONT_FAMILY = "Inter";

/**
 * One-time check: if `canvas` is not resolvable (typical on Vercel), log SVG-only path.
 * Uses `require.resolve` only — does not load native bindings.
 */
export function warnCanvasUnavailableOnce() {
  if (canvasGuardDone) return;
  canvasGuardDone = true;
  try {
    const req = (0, eval)("require") as { resolve: (id: string) => string };
    req.resolve("canvas");
  } catch {
    console.warn("[render] canvas not available — using SVG fallback");
  }
}

/**
 * Slot/engagement SVGs use `<path>` from `text-to-svg` (no `@font-face`, no system fonts).
 * Kept as a no-op fragment so call sites stay stable.
 */
export function getSvgDocumentFontStyleBlock(): string {
  return "";
}

/** Absolute path to bundled bold TTF (e.g. ffmpeg `fontfile`, `text-to-svg` input). */
export function getInterBoldFontPath(): string {
  return path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
}
