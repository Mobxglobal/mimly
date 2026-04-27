/**
 * Text width estimates for wrapping (no node-canvas). Tuned for bundled Inter;
 * SVG output uses the same font via @font-face — estimates align closely enough for line breaks.
 */
import { warnCanvasUnavailableOnce } from "@/lib/rendering/fonts";

/** Average glyph width / font-size for Inter regular (conservative). */
const WIDTH_RATIO_REGULAR = 0.52;
/** Slightly wider for bold / font-weight 700 SVG text. */
const WIDTH_RATIO_BOLD = 0.56;

function graphemeCount(text: string): number {
  return [...String(text ?? "")].length;
}

function estimateInterLineWidthPx(
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
  return estimateInterLineWidthPx(text, 52, false);
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
  return estimateInterLineWidthPx(text, size, Boolean(options?.bold));
}
