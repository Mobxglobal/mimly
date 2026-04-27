import fs from "fs";
import path from "path";

let svgFontFaceBlock: string | null = null;
let canvasGuardDone = false;

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

export function getInterSvgFontFaceBlock(): string {
  warnCanvasUnavailableOnce();
  if (svgFontFaceBlock) return svgFontFaceBlock;
  const regularPath = path.join(process.cwd(), "public", "fonts", "Inter-Regular.ttf");
  const boldPath = path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
  const regularB64 = fs.readFileSync(regularPath).toString("base64");
  const boldB64 = fs.readFileSync(boldPath).toString("base64");
  svgFontFaceBlock = `<style type="text/css"><![CDATA[
@font-face{font-family:Inter;font-style:normal;font-weight:400;font-display:block;src:url(data:font/ttf;base64,${regularB64}) format("truetype");}
@font-face{font-family:Inter;font-style:normal;font-weight:700;font-display:block;src:url(data:font/ttf;base64,${boldB64}) format("truetype");}
]]></style>`;
  return svgFontFaceBlock;
}

/** Absolute path to bundled bold TTF (e.g. ffmpeg `fontfile`). */
export function getInterBoldFontPath(): string {
  return path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
}
