/**
 * Text width measurement for square text memes — must match SVG caption styling in
 * `renderSquareTextMeme.ts`: 52px Inter (regular weight), bundled via `ensureFontsRegistered`.
 */
import { ensureFontsRegistered } from "@/lib/rendering/fonts";

type MeasureContext = {
  font: string;
  measureText: (text: string) => { width: number };
};

type CanvasModule = {
  createCanvas: (width: number, height: number) => {
    getContext: (contextId: "2d") => MeasureContext | null;
  };
};

let cachedCtx: MeasureContext | null = null;
let canvasModuleLoadAttempted = false;
let canvasModule: CanvasModule | null = null;
let loggedSquareMeasureFont = false;

function getCanvasModule(): CanvasModule | null {
  if (canvasModuleLoadAttempted) return canvasModule;
  canvasModuleLoadAttempted = true;
  try {
    const dynamicRequire = eval("require") as (id: string) => unknown;
    const loaded = dynamicRequire("canvas") as CanvasModule;
    canvasModule = loaded;
    return loaded;
  } catch {
    canvasModule = null;
    return null;
  }
}

function estimateTextWidthPx(text: string, fontSizePx: number): number {
  return String(text ?? "").length * fontSizePx * 0.56;
}

function getSquareTextMeasureContext(): MeasureContext | null {
  if (!cachedCtx) {
    ensureFontsRegistered();
    const canvas = getCanvasModule();
    if (!canvas) return null;
    const c = canvas.createCanvas(4096, 128);
    const ctx = c.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.font = "52px Inter";
    if (!loggedSquareMeasureFont) {
      console.log("[font] using font:", ctx.font);
      loggedSquareMeasureFont = true;
    }
    cachedCtx = ctx;
  }
  return cachedCtx;
}

/** Returns horizontal advance width in CSS pixels for the full line string. */
export function measureSquareTextLineWidthPx(text: string): number {
  const t = String(text ?? "");
  if (!t) return 0;
  const ctx = getSquareTextMeasureContext();
  if (!ctx) return estimateTextWidthPx(t, 52);
  return ctx.measureText(t).width;
}

const dynamicCtxCache = new Map<string, MeasureContext>();
const loggedDynamicFontKeys = new Set<string>();

/**
 * Generic line-width measurement for caption rendering with explicit font sizing.
 * Family is always bundled Inter; use `bold` to match SVG `font-weight: 700` layouts.
 */
export function measureLineWidthPx(
  text: string,
  fontSizePx: number,
  _fontFamily: string,
  options?: { bold?: boolean }
): number {
  const t = String(text ?? "");
  if (!t) return 0;
  const size = Number.isFinite(fontSizePx) ? Math.max(1, fontSizePx) : 52;
  const bold = Boolean(options?.bold);
  const key = `${bold ? "b" : "n"}|${size}`;

  let ctx = dynamicCtxCache.get(key) ?? null;
  if (!ctx) {
    ensureFontsRegistered();
    const canvas = getCanvasModule();
    if (!canvas) return estimateTextWidthPx(t, size);
    const c = canvas.createCanvas(4096, 128);
    const next = c.getContext("2d");
    if (!next) {
      return estimateTextWidthPx(t, size);
    }
    next.font = bold ? `bold ${size}px Inter` : `${size}px Inter`;
    if (!loggedDynamicFontKeys.has(key)) {
      console.log("[font] using font:", next.font);
      loggedDynamicFontKeys.add(key);
    }
    ctx = next;
    dynamicCtxCache.set(key, ctx);
  }

  return ctx.measureText(t).width;
}
