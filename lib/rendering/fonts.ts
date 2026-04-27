import path from "path";

let canvasGuardDone = false;
let renderSharpFontLogDone = false;

/**
 * Generic family for Sharp/librsvg SVG text — avoids named faces (Arial, Helvetica, Inter)
 * that may be missing or mis-resolve on serverless; fontconfig maps `sans-serif` to a real face.
 */
export const SHARP_SVG_FONT_FAMILY = "sans-serif";

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
  if (!renderSharpFontLogDone) {
    renderSharpFontLogDone = true;
    console.log("[render] using font: sans-serif");
  }
  return `<style type="text/css"><![CDATA[
text {
  font-family: sans-serif;
}
]]></style>`;
}

/** Absolute path to bundled bold TTF (e.g. ffmpeg `fontfile`). */
export function getInterBoldFontPath(): string {
  return path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
}
