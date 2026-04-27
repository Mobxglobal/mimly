import fs from "fs";
import path from "path";

let canvasGuardDone = false;
let renderSharpFontLogDone = false;
let embeddedInterSvgDefs: string | null = null;

/**
 * Family name for Sharp/librsvg SVG text — matches `@font-face` in `getSvgDocumentFontStyleBlock()`.
 * Embedded TTF avoids fontconfig when `sans-serif` cannot resolve (e.g. serverless).
 */
export const SHARP_SVG_FONT_FAMILY = "InterEmbed";

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

function buildEmbeddedInterSvgFontDefs(): string {
  const fontPath = path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
  const fontData = fs.readFileSync(fontPath).toString("base64");
  return `<defs>
  <style type="text/css"><![CDATA[
@font-face {
  font-family: 'InterEmbed';
  src: url(data:font/truetype;base64,${fontData}) format('truetype');
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
}
text {
  font-family: 'InterEmbed';
}
]]></style>
</defs>`;
}

/**
 * Embedded Inter (base64) + global `text` rule for Sharp SVG — no system fontconfig resolution.
 * Logs once per process on first injection.
 */
export function getSvgDocumentFontStyleBlock(): string {
  if (!renderSharpFontLogDone) {
    renderSharpFontLogDone = true;
    console.log("[render] using font: InterEmbed (embedded)");
  }
  if (!embeddedInterSvgDefs) {
    embeddedInterSvgDefs = buildEmbeddedInterSvgFontDefs();
  }
  return embeddedInterSvgDefs;
}

/** Absolute path to bundled bold TTF (e.g. ffmpeg `fontfile`). */
export function getInterBoldFontPath(): string {
  return path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
}
