/**
 * Text width estimates for wrapping (no node-canvas). Ratios tuned for generic sans metrics
 * used for Sharp output where glyphs are vector paths (`text-to-svg` / Inter-Bold).
 */
import { warnCanvasUnavailableOnce } from "@/lib/rendering/fonts";

/** Average glyph width / font-size for regular sans (conservative). */
const WIDTH_RATIO_REGULAR = 0.52;
/** Slightly wider for bold / font-weight 700 SVG text. */
const WIDTH_RATIO_BOLD = 0.56;

function graphemeCount(text: string): number {
  return [...String(text ?? "")].length;
}

function estimateSansLineWidthPx(
  text: string,
  fontSizePx: number,
  bold: boolean
): number {
  warnCanvasUnavailableOnce();
  const t = String(text ?? "");
  if (!t) return 0;
  const size = Number.isFinite(fontSizePx) ? Math.max(1, fontSizePx) : 52;
  const ratio = bold ? WIDTH_RATIO_BOLD : WIDTH_RATIO_REGULAR;
  return graphemeCount(t) * size * ratio;
}

/** Returns estimated horizontal advance width in CSS pixels for the full line string. */
export function measureSquareTextLineWidthPx(text: string): number {
  return estimateSansLineWidthPx(text, 52, false);
}

/**
 * Generic line-width estimate for caption / engagement wrapping.
 * `bold` should match SVG `font-weight: 700` where applicable.
 */
export function measureLineWidthPx(
  text: string,
  fontSizePx: number,
  _fontFamily: string,
  options?: { bold?: boolean }
): number {
  const size = Number.isFinite(fontSizePx) ? Math.max(1, fontSizePx) : 52;
  return estimateSansLineWidthPx(text, size, Boolean(options?.bold));
}
