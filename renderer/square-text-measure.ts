import { createCanvas, type CanvasRenderingContext2D } from "canvas";

/**
 * Text width measurement for square text memes — must match SVG caption styling in
 * `renderSquareTextMeme.ts`: 52px Arial, Helvetica, sans-serif (regular weight).
 */
let cachedCtx: CanvasRenderingContext2D | null = null;

function getSquareTextMeasureContext(): CanvasRenderingContext2D {
  if (!cachedCtx) {
    const c = createCanvas(4096, 128);
    const ctx = c.getContext("2d");
    if (!ctx) {
      throw new Error("[square-text-measure] Canvas 2D context unavailable");
    }
    ctx.font = "52px Arial, Helvetica, sans-serif";
    cachedCtx = ctx;
  }
  return cachedCtx;
}

/** Returns horizontal advance width in CSS pixels for the full line string. */
export function measureSquareTextLineWidthPx(text: string): number {
  const t = String(text ?? "");
  if (!t) return 0;
  return getSquareTextMeasureContext().measureText(t).width;
}
