import sharp from "sharp";
import { wrapSquareTextMemeLines } from "@/renderer/caption-wrap";
import { measureSquareTextLineWidthPx } from "@/renderer/square-text-measure";
import {
  getSvgDocumentFontStyleBlock,
  SHARP_SVG_FONT_FAMILY,
} from "@/lib/rendering/fonts";
import {
  SVG_UTF8_XML_DECL,
  escapeXML,
  logSvgDebugSample,
  svgStringToUtf8Buffer,
} from "@/lib/rendering/svg-utf8";
import {
  resolveEngagementTheme,
  type EngagementVisualStyle,
} from "@/lib/memes/engagement-style";

const CANVAS = 1080;
const MARGIN_X = 96;

const FONT_SIZE = 52;

/** Inner offset from canvas edge for multi-line left edge (keeps type off the margin hairline). */
const MULTI_LINE_PAD_X = 16;

/**
 * Max measured line width for copy drawn from multi-line anchor x = 112.
 * 896px ⇒ implied right extent x = 1008 (slightly past the 984 “safe” vertical, for fuller lines).
 * Wrapping uses estimated line widths (see `square-text-measure.ts`).
 */
export const SQUARE_TEXT_MAX_LINE_WIDTH_PX = 896;

/**
 * Documented layout constants for tooling / calibration (single source of truth with renderer).
 * Intended text band: symmetric horizontal insets `marginX` from canvas edges (888px wide).
 * Multi-line glyphs use anchor x = marginX + multiLinePadX (112).
 */
export const SQUARE_TEXT_LAYOUT_METRICS = {
  canvas: CANVAS,
  /** Left/right inset from canvas edge to “safe” verticals (x = 96 and x = 984). */
  marginX: MARGIN_X,
  multiLinePadX: MULTI_LINE_PAD_X,
  /** Multi-line `text-anchor="start"` x position (96 + 16). */
  multiLineAnchorX: MARGIN_X + MULTI_LINE_PAD_X,
  /** Right safe vertical x = canvas - marginX. */
  safeRightX: CANVAS - MARGIN_X,
  /** Center vertical guide x. */
  centerX: CANVAS / 2,
  /** Nominal drawable width between safe verticals (888). */
  textBandWidth: CANVAS - 2 * MARGIN_X,
  fontSizePx: FONT_SIZE,
  /** Pixel budget per line for multi-line blocks (anchor 112 → effective right ~1008). */
  maxLineWidthPx: SQUARE_TEXT_MAX_LINE_WIDTH_PX,
} as const;

const LINE_HEIGHT_SINGLE = Math.round(FONT_SIZE * 1.18);
const LINE_HEIGHT_STACK = Math.round(FONT_SIZE * 1.08);
const BLOCK_GAP = Math.round(FONT_SIZE * 0.68);

function normalizeText(text: string): string {
  return String(text ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Combine template slot max lines with pixel width: long/wide copy may need more lines than
 * the template minimum so we never render one ultra-wide line when wrapping can split it.
 */
function effectiveMaxLines(requestedMaxLines: number, text: string): number {
  const t = normalizeText(text);
  if (!t) return Math.min(16, Math.max(1, requestedMaxLines));

  const cap = Math.min(16, Math.max(1, requestedMaxLines));
  const w = measureSquareTextLineWidthPx(t);
  let minLines = Math.max(1, Math.ceil(w / SQUARE_TEXT_MAX_LINE_WIDTH_PX));
  if (w > SQUARE_TEXT_MAX_LINE_WIDTH_PX) {
    minLines = Math.max(minLines, 2);
  }

  return Math.min(16, Math.max(cap, minLines));
}

/**
 * Prefer 2–3 lines for medium copy (meme-wide lines); allow more only when length needs it.
 * `minNeeded` is derived from measured full-text width vs the 896px line budget.
 */
function wrapLineBudget(text: string, requestedMaxLines: number): number {
  const t = normalizeText(text);
  if (!t) return Math.min(16, Math.max(1, requestedMaxLines));

  const base = effectiveMaxLines(requestedMaxLines, t);
  const w = measureSquareTextLineWidthPx(t);
  const minNeeded = Math.max(1, Math.ceil(w / SQUARE_TEXT_MAX_LINE_WIDTH_PX));
  const softPreferMax =
    t.length <= 140 ? 3 : t.length <= 260 ? 4 : t.length <= 400 ? 5 : 16;

  return Math.max(minNeeded, Math.min(base, softPreferMax));
}

/**
 * Phrase-scored word-boundary layouts (`wrapSquareTextMemeLines`) for natural meme breaks.
 */
function wrapSquareTextBlock(text: string, requestedMaxLines: number): string[] {
  const t = normalizeText(text);
  if (!t) return [];

  const maxLines = wrapLineBudget(t, requestedMaxLines);
  return wrapSquareTextMemeLines(t, SQUARE_TEXT_MAX_LINE_WIDTH_PX, maxLines);
}

function blockLineHeight(lines: string[]): number {
  return lines.length > 1 ? LINE_HEIGHT_STACK : LINE_HEIGHT_SINGLE;
}

function blockHeight(lines: string[]): number {
  if (!lines.length) return 0;
  const lh = blockLineHeight(lines);
  return lines.length * lh;
}

type TextLineLayoutRow = { baselineY: number; lineHeightPx: number };

/**
 * Single line: centered. Multi-line: same left edge in a wide band (meme style, not a narrow column).
 */
function renderTextBlockLines(
  lines: string[],
  startY: number
): {
  svgFragments: string[];
  nextY: number;
  layoutRows: TextLineLayoutRow[];
} {
  if (!lines.length) {
    return { svgFragments: [], nextY: startY, layoutRows: [] };
  }

  const single = lines.length === 1;
  const x = single ? CANVAS / 2 : MARGIN_X + MULTI_LINE_PAD_X;
  const textAnchor = single ? "middle" : "start";
  const lh = blockLineHeight(lines);

  const fragments: string[] = [];
  const layoutRows: TextLineLayoutRow[] = [];
  let y = startY;
  for (const line of lines) {
    layoutRows.push({ baselineY: y, lineHeightPx: lh });
    fragments.push(
      `<text x="${x}" y="${y}" text-anchor="${textAnchor}" class="caption">${escapeXML(line)}</text>`
    );
    y += lh;
  }
  return { svgFragments: fragments, nextY: y, layoutRows };
}

/** Temporary calibration overlay — only emitted when `debug: true`. */
function buildSquareTextDebugGuidesSvg(layoutRows: TextLineLayoutRow[]): string {
  const safeL = MARGIN_X;
  const safeR = CANVAS - MARGIN_X;
  const multiX = MARGIN_X + MULTI_LINE_PAD_X;
  const cx = CANVAS / 2;

  const vertical = (
    x: number,
    stroke: string,
    dash: string | null,
    width: number
  ) =>
    `<line x1="${x}" y1="0" x2="${x}" y2="${CANVAS}" stroke="${stroke}" stroke-width="${width}" ${
      dash ? `stroke-dasharray="${dash}"` : ""
    } />`;

  const horizontal = (
    y: number,
    stroke: string,
    dash: string | null,
    width: number
  ) =>
    `<line x1="0" y1="${y}" x2="${CANVAS}" y2="${y}" stroke="${stroke}" stroke-width="${width}" ${
      dash ? `stroke-dasharray="${dash}"` : ""
    } />`;

  const rowGuides = layoutRows
    .map(({ baselineY, lineHeightPx }) => {
      const yTop = Math.round(baselineY - FONT_SIZE * 0.88);
      const h = Math.max(lineHeightPx, Math.round(FONT_SIZE * 1.15));
      return [
        `<rect x="${safeL}" y="${yTop}" width="${safeR - safeL}" height="${h}" fill="rgba(147,197,253,0.12)" stroke="#60a5fa" stroke-width="1" />`,
        horizontal(baselineY, "#0ea5e9", "3 5", 1),
      ].join("\n");
    })
    .join("\n");

  return `
<g id="square-text-debug-guides" pointer-events="none">
  ${horizontal(MARGIN_X, "#ea580c", "6 4", 1)}
  ${horizontal(CANVAS - MARGIN_X, "#ea580c", "6 4", 1)}
  ${vertical(safeL, "#dc2626", null, 2)}
  ${vertical(safeR, "#dc2626", null, 2)}
  ${vertical(multiX, "#2563eb", "5 5", 1.5)}
  ${vertical(cx, "#c026d3", "10 8", 2)}
  ${rowGuides}
  <text x="${safeL + 4}" y="28" fill="#7c3aed" font-size="18" font-family="${SHARP_SVG_FONT_FAMILY}">DEBUG square_text guides: red=safe verticals (96/984), blue dashed=multi-line anchor (112), magenta=center (540), orange=top/bottom margin (96), cyan=baseline, blue fill=row band</text>
</g>`.trim();
}

/**
 * Plain 1080×1080 PNG: white background, embedded Inter (Sharp); wide wrap + phrase scoring; single line
 * centered, multi-line left-aligned in the full margin band.
 *
 * @param params.debug — TEMPORARY: draws calibration guides (safe margins, center, baselines).
 *   Do not enable in production; used by `scripts/generate-square-text-calibration.ts`.
 */
export async function renderSquareTextMemePng(params: {
  topText: string;
  bottomText: string | null;
  slot1MaxLines: number;
  slot2MaxLines: number;
  engagementStyle?: EngagementVisualStyle | null;
  /** When true, overlays margin/center/baseline guides for visual calibration only. */
  debug?: boolean;
}): Promise<Buffer> {
  const top = normalizeText(params.topText);
  const bottom = normalizeText(params.bottomText ?? "");

  const maxLines1 = Math.min(16, Math.max(1, params.slot1MaxLines || 8));
  const maxLines2 = Math.min(16, Math.max(1, params.slot2MaxLines || 4));

  const lines1 = wrapSquareTextBlock(top, maxLines1);
  const lines2 =
    bottom && params.slot2MaxLines > 0
      ? wrapSquareTextBlock(bottom, maxLines2)
      : [];
  const theme = resolveEngagementTheme(params.engagementStyle);

  const h1 = blockHeight(lines1);
  const h2 = blockHeight(lines2);
  const gap = lines1.length > 0 && lines2.length > 0 ? BLOCK_GAP : 0;
  const totalTextHeight = h1 + gap + h2;

  let startY = (CANVAS - totalTextHeight) / 2 + FONT_SIZE * 0.82;
  const minStartY = MARGIN_X + FONT_SIZE * 0.82;
  if (startY < minStartY) startY = minStartY;

  const textElements: string[] = [];
  const layoutRowsForDebug: TextLineLayoutRow[] = [];

  const block1 = renderTextBlockLines(lines1, startY);
  textElements.push(...block1.svgFragments);
  layoutRowsForDebug.push(...block1.layoutRows);
  let y = block1.nextY;

  if (lines1.length > 0 && lines2.length > 0) {
    y += BLOCK_GAP;
  }

  const block2 = renderTextBlockLines(lines2, y);
  textElements.push(...block2.svgFragments);
  layoutRowsForDebug.push(...block2.layoutRows);

  const debugOverlay =
    params.debug && layoutRowsForDebug.length > 0
      ? buildSquareTextDebugGuidesSvg(layoutRowsForDebug)
      : params.debug
        ? buildSquareTextDebugGuidesSvg([])
        : "";

  const svg = `${SVG_UTF8_XML_DECL}
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  ${getSvgDocumentFontStyleBlock()}
  <rect width="${CANVAS}" height="${CANVAS}" fill="${theme.canvasBg}"/>
  <style>
    .caption {
      fill: ${theme.textPrimary};
      font-size: ${FONT_SIZE}px;
      font-family: 'Inter';
      font-weight: bold;
    }
  </style>
  ${textElements.join("\n")}
  ${debugOverlay}
</svg>
`.trim();

  logSvgDebugSample(top || bottom);

  const out = await sharp(svgStringToUtf8Buffer(svg)).png().toBuffer();
  if (!out?.length) {
    throw new Error("[render] renderSquareTextMemePng produced empty buffer");
  }
  return out;
}
