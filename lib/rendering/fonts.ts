import fs from "fs";
import path from "path";

let fontsRegistered = false;
let svgFontFaceBlock: string | null = null;

/** Avoid top-level `import "canvas"` so Next can analyze routes without loading native bindings. */
function getRegisterFont(): (
  src: string,
  options: { family: string; weight?: string }
) => void {
  const dynamicRequire = eval("require") as (id: string) => {
    registerFont: (src: string, options: { family: string; weight?: string }) => void;
  };
  return dynamicRequire("canvas").registerFont;
}

export function getInterSvgFontFaceBlock(): string {
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

export function ensureFontsRegistered() {
  if (fontsRegistered) return;

  try {
    const registerFont = getRegisterFont();
    const regularPath = path.join(process.cwd(), "public", "fonts", "Inter-Regular.ttf");
    const boldPath = path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");

    registerFont(regularPath, { family: "Inter", weight: "normal" });
    registerFont(boldPath, { family: "Inter", weight: "bold" });

    console.log("[fonts] registered Inter-Regular and Inter-Bold");

    fontsRegistered = true;
  } catch (err) {
    console.error("[fonts] failed to register font:", err);
    throw err;
  }
}

/** Absolute path to bundled bold TTF (e.g. ffmpeg `fontfile`). */
export function getInterBoldFontPath(): string {
  return path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
}
