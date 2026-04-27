/**
 * Text width measurement for square text memes — must match SVG caption styling in
 * `renderSquareTextMeme.ts`: 52px Arial, Helvetica, sans-serif (regular weight).
 */
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

function getCanvasModule(): CanvasModule | null {
  if (canvasModuleLoadAttempted) return canvasModule;
  canvasModuleLoadAttempted = true;
  try {
    // Keep this dynamic so build doesn't require native canvas at module evaluation time.
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
  // Fallback approximation when native canvas bindings are unavailable in the build/runtime.
  return String(text ?? "").length * fontSizePx * 0.56;
}

function getSquareTextMeasureContext(): MeasureContext | null {
  if (!cachedCtx) {
    const canvas = getCanvasModule();
    if (!canvas) return null;
    const c = canvas.createCanvas(4096, 128);
    const ctx = c.getContext("2d");
    if (!ctx) {
      return null;
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
  const ctx = getSquareTextMeasureContext();
  if (!ctx) return estimateTextWidthPx(t, 52);
  return ctx.measureText(t).width;
}

const dynamicCtxCache = new Map<string, MeasureContext>();

/**
 * Generic line-width measurement for caption rendering with explicit font sizing/family.
 */
export function measureLineWidthPx(
  text: string,
  fontSizePx: number,
  fontFamily: string
): number {
  const t = String(text ?? "");
  if (!t) return 0;
  const size = Number.isFinite(fontSizePx) ? Math.max(1, fontSizePx) : 52;
  const rawFamily = String(fontFamily ?? "").trim() || "Arial, Helvetica, sans-serif";
  const family = /sans-serif/i.test(rawFamily)
    ? rawFamily
    : `${rawFamily}, sans-serif`;
  const key = `${size}|${family}`;

  let ctx = dynamicCtxCache.get(key) ?? null;
  if (!ctx) {
    const canvas = getCanvasModule();
    if (!canvas) return estimateTextWidthPx(t, size);
    const c = canvas.createCanvas(4096, 128);
    const next = c.getContext("2d");
    if (!next) {
      return estimateTextWidthPx(t, size);
    }
    next.font = `${size}px ${family}`;
    ctx = next;
    dynamicCtxCache.set(key, ctx);
  }

  return ctx.measureText(t).width;
}
