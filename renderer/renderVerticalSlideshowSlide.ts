import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { wrapSlideshowVerticalLines } from "@/renderer/caption-wrap";
import type { SlideshowLayoutVariant } from "@/lib/memes/slideshow/types";

const CANVAS_W = 1080;
const CANVAS_H = 1920;

/**
 * Vertical slideshow text column — centered, narrower than full canvas so lines wrap sooner
 * (Reels/TikTok-style). Must stay in sync with `layout_*_max_chars` defaults in types.ts.
 */
const SLIDESHOW_TEXT_BAND_WIDTH_PX = 680;

/**
 * Fixed bands: `layout_a` = Text A (upper-middle), `layout_b` = Text B (middle — vertically centered on the slide).
 * Coordinates are top-left of the band rect; text is centered horizontally and vertically within.
 */
const TEXT_A_BAND = { y: 280, height: 480 } as const;
const TEXT_B_BAND_HEIGHT = 560;
const TEXT_B_BAND = {
  y: Math.round((CANVAS_H - TEXT_B_BAND_HEIGHT) / 2),
  height: TEXT_B_BAND_HEIGHT,
} as const;

/**
 * Family name referenced in SVG/CSS — must match @font-face. All vertical slideshow text uses
 * this face; `slideshow_config.font_family` is accepted on the style object but mapped here so
 * config stays backward-compatible without pulling arbitrary system fonts into Sharp's SVG path.
 */
export const SLIDESHOW_EMBEDDED_FONT_FAMILY = "ProximaNovaSemibold";

const SLIDESHOW_FONT_DIR = path.join(process.cwd(), "assets", "fonts");
/** Prefer canonical filename; second entry matches a legacy on-disk typo (space before Semibold). */
const SLIDESHOW_FONT_FILENAMES = [
  "Proxima_Nova_Semibold.ttf",
  "Proxima_Nova_ Semibold.ttf",
] as const;

let cachedFontFaceBlock: string | null = null;

function resolveSlideshowFontPath(): string {
  for (const name of SLIDESHOW_FONT_FILENAMES) {
    const full = path.join(SLIDESHOW_FONT_DIR, name);
    if (fs.existsSync(full)) return full;
  }
  return "";
}

/**
 * Lazily reads the TTF once, base64-embeds it in a CSS @font-face block for the SVG Sharp composites.
 *
 * Why base64 in SVG: Sharp/librsvg rasterizes the overlay without access to project-relative font
 * paths; an inline data URI makes the face available deterministically on every environment.
 */
function getSlideshowFontFaceBlock(): string {
  if (cachedFontFaceBlock) return cachedFontFaceBlock;

  const fontPath = resolveSlideshowFontPath();
  if (!fontPath) {
    console.error("[slideshow-render] Slideshow font missing", {
      dir: SLIDESHOW_FONT_DIR,
      tried: [...SLIDESHOW_FONT_FILENAMES],
    });
    throw new Error(
      `[slideshow-render] Slideshow font not found. Place Proxima Nova Semibold at ${path.join(
        SLIDESHOW_FONT_DIR,
        SLIDESHOW_FONT_FILENAMES[0]
      )} (see renderer/renderVerticalSlideshowSlide.ts for accepted filenames).`
    );
  }

  let buf: Buffer;
  try {
    buf = fs.readFileSync(fontPath);
  } catch (err) {
    console.error("[slideshow-render] Failed to read slideshow font file", {
      fontPath,
      err,
    });
    throw new Error(
      `[slideshow-render] Could not read slideshow font file: ${fontPath}`
    );
  }

  const b64 = buf.toString("base64");
  cachedFontFaceBlock = `
@font-face {
  font-family: '${SLIDESHOW_EMBEDDED_FONT_FAMILY}';
  src: url('data:font/ttf;base64,${b64}') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}`;
  return cachedFontFaceBlock;
}

export type VerticalSlideshowRenderStyle = {
  layout_a_max_chars: number;
  layout_b_max_chars: number;
  layout_a_max_lines: number;
  layout_b_max_lines: number;
  font_size_layout_a: number;
  font_size_layout_b: number;
  /** Kept for template config compatibility; glyphs always use the embedded Proxima Nova Semibold face. */
  font_family: string;
  text_color: string;
  stroke_color: string;
  stroke_width: number;
};

function escapeXML(str: unknown) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Text band geometry for 1080×1920 vertical slides (centered narrow column). */
function getTextBand(layout: SlideshowLayoutVariant): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const x = Math.round((CANVAS_W - SLIDESHOW_TEXT_BAND_WIDTH_PX) / 2);
  if (layout === "layout_a") {
    return {
      x,
      y: TEXT_A_BAND.y,
      width: SLIDESHOW_TEXT_BAND_WIDTH_PX,
      height: TEXT_A_BAND.height,
    };
  }
  return {
    x,
    y: TEXT_B_BAND.y,
    width: SLIDESHOW_TEXT_BAND_WIDTH_PX,
    height: TEXT_B_BAND.height,
  };
}

function renderLinesSvg(
  lines: string[],
  band: { x: number; y: number; width: number; height: number },
  style: {
    fontSize: number;
    textColor: string;
    strokeColor: string;
    strokeWidth: number;
  }
): string {
  if (!lines.length) return "";

  const lineHeight = Math.round(style.fontSize * 1.22);
  const totalTextHeight = lines.length * lineHeight;
  const startY = band.y + (band.height - totalTextHeight) / 2 + style.fontSize;
  const cx = band.x + band.width / 2;

  return lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      const strokeAttrs =
        style.strokeWidth > 0 && style.strokeColor
          ? `stroke="${escapeXML(style.strokeColor)}" stroke-width="${style.strokeWidth}" paint-order="stroke"`
          : "";
      return `<text class="cap" x="${cx}" y="${y}" text-anchor="middle" ${strokeAttrs}>${escapeXML(
        line
      )}</text>`;
    })
    .join("");
}

function buildTextSvg(
  text: string,
  layout: SlideshowLayoutVariant,
  style: VerticalSlideshowRenderStyle
): string {
  const band = getTextBand(layout);
  const maxChars =
    layout === "layout_a"
      ? style.layout_a_max_chars
      : style.layout_b_max_chars;
  const maxLines =
    layout === "layout_a"
      ? style.layout_a_max_lines
      : style.layout_b_max_lines;
  const fontSize =
    layout === "layout_a"
      ? style.font_size_layout_a
      : style.font_size_layout_b;

  const lines = wrapSlideshowVerticalLines(text, maxChars, maxLines);
  const inner = renderLinesSvg(lines, band, {
    fontSize,
    textColor: style.text_color,
    strokeColor: style.stroke_color,
    strokeWidth: style.stroke_width,
  });

  const fontFace = getSlideshowFontFaceBlock();

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}">
  <style type="text/css">
    ${fontFace}
    .cap {
      fill: ${style.text_color};
      font-size: ${fontSize}px;
      font-family: '${SLIDESHOW_EMBEDDED_FONT_FAMILY}', sans-serif;
      font-weight: normal;
    }
  </style>
  ${inner}
</svg>`;
}

/**
 * 1080×1920 PNG: cover-scaled background, 50% black overlay, typography (layout_a upper / layout_b middle).
 */
export async function renderVerticalSlideshowSlidePng(params: {
  backgroundBuffer: Buffer;
  text: string;
  layout_variant: SlideshowLayoutVariant;
  style: VerticalSlideshowRenderStyle;
}): Promise<Buffer> {
  const base = await sharp(params.backgroundBuffer)
    .resize(CANVAS_W, CANVAS_H, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const overlayPng = await sharp({
    create: {
      width: CANVAS_W,
      height: CANVAS_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();

  const svg = buildTextSvg(params.text, params.layout_variant, params.style);
  const svgBuf = Buffer.from(svg);

  return sharp(base)
    .composite([
      { input: overlayPng, left: 0, top: 0, blend: "over" },
      { input: svgBuf, left: 0, top: 0, blend: "over" },
    ])
    .png()
    .toBuffer();
}
