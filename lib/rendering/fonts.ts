import path from "path";

let canvasGuardDone = false;
let renderFontStackLogDone = false;

/**
 * Stack for Sharp/librsvg SVG text: Arial is often missing on Linux/serverless;
 * Helvetica and generic sans-serif give Pango usable fallbacks.
 */
export const SVG_SAFE_FONT_STACK = "Arial, Helvetica, sans-serif";

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
 * Global SVG rule for all `<text>` nodes — no @font-face (unreliable with Sharp).
 * Logs once per process on first injection.
 */
export function getSvgDocumentFontStyleBlock(): string {
  if (!renderFontStackLogDone) {
    renderFontStackLogDone = true;
    console.log("[render] using font stack: Arial, Helvetica, sans-serif");
  }
  return `<style type="text/css"><![CDATA[
text {
  font-family: Arial, Helvetica, sans-serif;
}
]]></style>`;
}

/** Absolute path to bundled bold TTF (e.g. ffmpeg `fontfile`). */
export function getInterBoldFontPath(): string {
  return path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
}
