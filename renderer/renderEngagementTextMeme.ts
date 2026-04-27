import sharp from "sharp";
import { measureLineWidthPx } from "@/renderer/square-text-measure";
import {
  getSvgDocumentFontStyleBlock,
  SHARP_SVG_FONT_FAMILY,
} from "@/lib/rendering/fonts";
import type { MemeTemplateForRender } from "@/renderer/renderMemeTemplate";
import {
  resolveEngagementTheme,
  type EngagementTheme,
  type EngagementVisualStyle,
} from "@/lib/memes/engagement-style";

const CANVAS = 1080;

function escapeXML(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeFontFamily(): string {
  return SHARP_SVG_FONT_FAMILY;
}

function wrapTextToLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  fontFamily: string
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measureLineWidthPx(next, fontSize, fontFamily, { bold: true }) <= maxWidth || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

type RenderEngagementTextMemePngParams = {
  template: MemeTemplateForRender;
  keyword?: string | null;
  topText?: string | null;
  bottomText?: string | null;
  names?: string[];
  /** Visual theme only; defaults to classic when omitted. */
  engagementStyle?: EngagementVisualStyle | null;
};

type EngagementLayoutParams = RenderEngagementTextMemePngParams & {
  theme: EngagementTheme;
};

type EngagementLayoutRenderer = (params: EngagementLayoutParams) => Promise<Buffer>;

function xmlLineWithBlankHighlight(line: string, theme: EngagementTheme): string {
  if (!line.includes("______")) {
    return escapeXML(line);
  }
  const parts = line.split("______");
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    out += escapeXML(parts[i] ?? "");
    if (i < parts.length - 1) {
      out += `<tspan font-weight="900" letter-spacing="2" fill="${escapeXML(theme.textPrimary)}">______</tspan>`;
    }
  }
  return out;
}

const ENGAGEMENT_LAYOUT_RENDERERS: Record<string, EngagementLayoutRenderer> = {
  finish_sentence: renderFinishSentenceLayout,
  birthday_names_list: renderBirthdayNamesListLayout,
  one_word: renderOneWordLayout,
  agree_disagree: renderAgreeDisagreeLayout,
  hot_take: renderHotTakeLayout,
  emoji_only: renderEmojiOnlyLayout,
  pick_one: renderPickOneLayout,
  fill_gap: renderFillGapLayout,
};

async function renderFinishSentenceLayout(
  params: EngagementLayoutParams
): Promise<Buffer> {
  const { template, keyword, theme } = params;

  // This layout is intentionally fixed to finish_sentence behavior.
  const fontFamily = normalizeFontFamily();
  const baseFontSize = Number.isFinite(template.font_size)
    ? Math.max(56, Math.min(64, Number(template.font_size)))
    : 60;

  const line1 = "Finish this sentence.";
  const safeKeyword = String(keyword ?? params.topText ?? "").trim();

  // Single-line sentence.
  const line2Prefix = "I hate ";
  const line2Suffix = " because";
  const line2 = `${line2Prefix}${safeKeyword}${line2Suffix}`;

  // Layout box: if slot_1 geometry exists, treat it as the full text+underline box.
  const boxX = template.slot_1_x ?? 0;
  const boxY = template.slot_1_y ?? 0;
  const boxW = template.slot_1_width ?? CANVAS;
  const boxH = template.slot_1_height ?? CANVAS;

  // Left-aligned social-native layout (consistent left margin).
  const leftMargin = 100;
  const rightMargin = 100;
  const xLeft = boxX + leftMargin;
  const xRight = boxX + boxW - rightMargin;
  const maxWidth = Math.max(600, xRight - xLeft);
  const measuredLine2 = measureLineWidthPx(line2, baseFontSize, fontFamily);

  let fontSize = baseFontSize;
  if (measuredLine2 > maxWidth) {
    fontSize = Math.floor((baseFontSize * maxWidth) / measuredLine2);
  }

  // Also guard line 1 to keep typography consistent and prevent overflow.
  const measuredLine1 = measureLineWidthPx(line1, fontSize, fontFamily);
  if (measuredLine1 > maxWidth) {
    fontSize = Math.floor((fontSize * maxWidth) / measuredLine1);
  }

  // Clamp: keep the “all text same size” rule while preventing tiny text.
  fontSize = Math.max(40, Math.min(baseFontSize, fontSize));

  // Keep vertical rhythm tight and visually even, with the visual centre anchored on line 2.
  // Shift the composition slightly down so line 2 reads as the primary anchor (underline is supportive only).
  const line1Y = Math.round(boxY + boxH * 0.37);
  const verticalGap = Math.round(boxH * 0.11);
  const line2Y = line1Y + verticalGap;
  const underlineY = line2Y + verticalGap;

  // Thin, crisp underline.
  const underlineThickness = Math.max(
    3,
    Math.min(4, Math.round(fontSize * 0.065))
  );

  const measuredLine2Width = measureLineWidthPx(line2, fontSize, fontFamily);
  const underlineExtra = Math.round(fontSize * 0.18); // small intentional extension
  const underlineWidth = Math.min(maxWidth, measuredLine2Width + underlineExtra);
  const underlineX = xLeft;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  ${getSvgDocumentFontStyleBlock()}
  <rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" fill="${escapeXML(theme.canvasBg)}" />

  <text x="${xLeft}" y="${line1Y}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${fontSize}" fill="${escapeXML(theme.textPrimary)}">
    ${escapeXML(line1)}
  </text>

  <text x="${xLeft}" y="${line2Y}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${fontSize}" fill="${escapeXML(theme.textPrimary)}">
    ${escapeXML(line2)}
  </text>

  <line x1="${underlineX}" y1="${underlineY}" x2="${underlineX + underlineWidth}" y2="${underlineY}"
    stroke="${escapeXML(theme.lineStroke)}" stroke-width="${underlineThickness}" stroke-linecap="round" />
</svg>
`.trim();

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderOneWordLayout(
  params: EngagementLayoutParams
): Promise<Buffer> {
  const { template, theme } = params;
  const topic = String(params.topText ?? "").trim();
  if (!topic) {
    throw new Error("one_word requires topText");
  }

  const fontFamily = normalizeFontFamily();
  const baseFontSize = Number.isFinite(template.font_size)
    ? Math.max(54, Math.min(70, Number(template.font_size)))
    : 62;

  const prefix = "Describe ";
  const suffix = " in ONE word.";
  const fullText = `${prefix}${topic}${suffix}`;

  const boxX = template.slot_1_x ?? 0;
  const boxY = template.slot_1_y ?? 0;
  const boxW = template.slot_1_width ?? CANVAS;
  const boxH = template.slot_1_height ?? CANVAS;

  const leftMargin = 88;
  const rightMargin = 88;
  const xLeft = boxX + leftMargin;
  const xRight = boxX + boxW - rightMargin;
  const maxWidth = Math.max(560, xRight - xLeft);

  const buildLines = (size: number): string[] => {
    const words = fullText.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (measureLineWidthPx(next, size, fontFamily, { bold: true }) <= maxWidth || !cur) {
        cur = next;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  let fontSize = baseFontSize;
  let lines = buildLines(fontSize);
  while (lines.length > 3 && fontSize > 38) {
    fontSize -= 2;
    lines = buildLines(fontSize);
  }
  fontSize = Math.max(38, Math.min(baseFontSize, fontSize));
  lines = buildLines(fontSize);

  const lineHeight = Math.round(fontSize * 1.22);
  const blockH = lines.length * lineHeight;
  const startY = Math.round(boxY + (boxH - blockH) / 2 + fontSize * 0.35);

  const textBlocks = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<text x="${xLeft}" y="${y}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${fontSize}" font-weight="700" fill="${escapeXML(theme.textPrimary)}">${escapeXML(line)}</text>`;
    })
    .join("\n  ");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  ${getSvgDocumentFontStyleBlock()}
  <rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" fill="${escapeXML(theme.canvasBg)}" />
  ${textBlocks}
</svg>
`.trim();

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderEmojiOnlyLayout(
  params: EngagementLayoutParams
): Promise<Buffer> {
  const { template, theme } = params;
  const topic = String(params.topText ?? "").trim();
  if (!topic) {
    throw new Error("emoji_only requires topText");
  }

  const fontFamily = normalizeFontFamily();
  const baseFontSize = Number.isFinite(template.font_size)
    ? Math.max(54, Math.min(70, Number(template.font_size)))
    : 62;

  const prefix = "Describe ";
  const suffix = " using emojis only.";
  const fullText = `${prefix}${topic}${suffix}`;

  const boxX = template.slot_1_x ?? 0;
  const boxY = template.slot_1_y ?? 0;
  const boxW = template.slot_1_width ?? CANVAS;
  const boxH = template.slot_1_height ?? CANVAS;

  const leftMargin = 88;
  const rightMargin = 88;
  const xLeft = boxX + leftMargin;
  const xRight = boxX + boxW - rightMargin;
  const maxWidth = Math.max(560, xRight - xLeft);

  const buildLines = (size: number): string[] => {
    const words = fullText.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (measureLineWidthPx(next, size, fontFamily, { bold: true }) <= maxWidth || !cur) {
        cur = next;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  let fontSize = baseFontSize;
  let lines = buildLines(fontSize);
  while (lines.length > 3 && fontSize > 38) {
    fontSize -= 2;
    lines = buildLines(fontSize);
  }
  fontSize = Math.max(38, Math.min(baseFontSize, fontSize));
  lines = buildLines(fontSize);

  const lineHeight = Math.round(fontSize * 1.22);
  const blockH = lines.length * lineHeight;
  const startY = Math.round(boxY + (boxH - blockH) / 2 + fontSize * 0.35);

  const textBlocks = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<text x="${xLeft}" y="${y}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${fontSize}" font-weight="700" fill="${escapeXML(theme.textPrimary)}">${escapeXML(line)}</text>`;
    })
    .join("\n  ");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  ${getSvgDocumentFontStyleBlock()}
  <rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" fill="${escapeXML(theme.canvasBg)}" />
  ${textBlocks}
</svg>
`.trim();

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Shared stack typography for agree_disagree + pick_one (aligned caps and vertical budget). */
const ENGAGEMENT_DEBATE_STACK_MAX_PX = 56;
const ENGAGEMENT_DEBATE_STACK_MIN_PX = 36;
const ENGAGEMENT_DEBATE_STACK_BLOCK_H = 0.8;

async function renderPickOneLayout(
  params: EngagementLayoutParams
): Promise<Buffer> {
  const { template, theme } = params;
  const a = String(params.topText ?? "").trim();
  const b = String(params.bottomText ?? "").trim();
  if (!a || !b) {
    throw new Error("pick_one requires topText and bottomText");
  }

  const header = "Pick one:";
  const fontFamily = normalizeFontFamily();

  const boxX = template.slot_1_x ?? 0;
  const boxY = template.slot_1_y ?? 0;
  const boxW = template.slot_1_width ?? CANVAS;
  const boxH = template.slot_1_height ?? CANVAS;
  const leftMargin = 88;
  const rightMargin = 88;
  const xLeft = boxX + leftMargin;
  const xRight = boxX + boxW - rightMargin;
  const maxWidth = Math.max(560, xRight - xLeft);
  const maxBlockH = boxH * ENGAGEMENT_DEBATE_STACK_BLOCK_H;
  const minSize = ENGAGEMENT_DEBATE_STACK_MIN_PX;
  const maxSize = ENGAGEMENT_DEBATE_STACK_MAX_PX;
  const lineGapMult = 1.22;

  let size = maxSize;
  let linesA: string[] = [];
  let linesB: string[] = [];
  for (let iter = 0; iter < 32; iter++) {
    linesA = wrapTextToLines(a, size, maxWidth, fontFamily);
    linesB = wrapTextToLines(b, size, maxWidth, fontFamily);
    const lh = Math.round(size * lineGapMult);
    const gapHeader = Math.round(size * 0.42);
    const gapOptions = Math.round(size * 0.55);
    const totalH =
      lh +
      gapHeader +
      linesA.length * lh +
      gapOptions +
      linesB.length * lh;
    if (totalH <= maxBlockH || size <= minSize) break;
    size -= 2;
  }
  size = Math.max(minSize, Math.min(maxSize, size));
  linesA = wrapTextToLines(a, size, maxWidth, fontFamily);
  linesB = wrapTextToLines(b, size, maxWidth, fontFamily);

  const lh = Math.round(size * lineGapMult);
  const gapHeader = Math.round(size * 0.42);
  const gapOptions = Math.round(size * 0.55);
  const totalBlockH =
    lh +
    gapHeader +
    linesA.length * lh +
    gapOptions +
    linesB.length * lh;
  const startY = Math.round(boxY + (boxH - totalBlockH) / 2 + size * 0.35);

  let yCursor = startY;
  const headSvg = `<text x="${xLeft}" y="${yCursor}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${size}" font-weight="700" fill="${escapeXML(theme.textPrimary)}">${escapeXML(header)}</text>`;
  yCursor += lh + gapHeader;

  const optASvg = linesA
    .map((line, i) => {
      const y = yCursor + i * lh;
      return `<text x="${xLeft}" y="${y}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${size}" font-weight="700" fill="${escapeXML(theme.textMuted)}">${escapeXML(line)}</text>`;
    })
    .join("\n  ");
  yCursor += linesA.length * lh + gapOptions;

  const optBSvg = linesB
    .map((line, i) => {
      const y = yCursor + i * lh;
      return `<text x="${xLeft}" y="${y}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${size}" font-weight="700" fill="${escapeXML(theme.textMuted)}">${escapeXML(line)}</text>`;
    })
    .join("\n  ");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  ${getSvgDocumentFontStyleBlock()}
  <rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" fill="${escapeXML(theme.canvasBg)}" />
  ${headSvg}
  ${optASvg}
  ${optBSvg}
</svg>
`.trim();

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderFillGapLayout(
  params: EngagementLayoutParams
): Promise<Buffer> {
  const { template, theme } = params;
  const statement = String(params.topText ?? "").trim();
  if (!statement) {
    throw new Error("fill_gap requires topText");
  }

  const fontFamily = normalizeFontFamily();
  const baseFontSize = Number.isFinite(template.font_size)
    ? Math.max(52, Math.min(64, Number(template.font_size)))
    : 58;

  const boxX = template.slot_1_x ?? 0;
  const boxY = template.slot_1_y ?? 0;
  const boxW = template.slot_1_width ?? CANVAS;
  const boxH = template.slot_1_height ?? CANVAS;
  const leftMargin = 88;
  const rightMargin = 88;
  const xLeft = boxX + leftMargin;
  const xRight = boxX + boxW - rightMargin;
  const maxWidth = Math.max(560, xRight - xLeft);
  const maxBlockH = boxH * 0.78;
  const minSize = 38;
  const lineGapMult = 1.22;

  const buildLines = (size: number): string[] => {
    const words = statement.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (measureLineWidthPx(next, size, fontFamily, { bold: true }) <= maxWidth || !cur) {
        cur = next;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  let fontSize = baseFontSize;
  let lines = buildLines(fontSize);
  while (lines.length * Math.round(fontSize * lineGapMult) > maxBlockH && fontSize > minSize) {
    fontSize -= 2;
    lines = buildLines(fontSize);
  }
  fontSize = Math.max(minSize, Math.min(baseFontSize, fontSize));
  lines = buildLines(fontSize);

  const lineHeight = Math.round(fontSize * lineGapMult);
  const blockH = lines.length * lineHeight;
  const startY = Math.round(boxY + (boxH - blockH) / 2 + fontSize * 0.35);

  const textBlocks = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<text x="${xLeft}" y="${y}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${fontSize}" font-weight="700" fill="${escapeXML(theme.textPrimary)}">${xmlLineWithBlankHighlight(line, theme)}</text>`;
    })
    .join("\n  ");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  ${getSvgDocumentFontStyleBlock()}
  <rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" fill="${escapeXML(theme.canvasBg)}" />
  ${textBlocks}
</svg>
`.trim();

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderAgreeDisagreeLayout(
  params: EngagementLayoutParams
): Promise<Buffer> {
  const { template, theme } = params;
  const statement = String(params.topText ?? "").trim();
  if (!statement) {
    throw new Error("agree_disagree requires topText");
  }
  const footer = "Agree or disagree?";
  const fontFamily = normalizeFontFamily();

  const boxX = template.slot_1_x ?? 0;
  const boxY = template.slot_1_y ?? 0;
  const boxW = template.slot_1_width ?? CANVAS;
  const boxH = template.slot_1_height ?? CANVAS;
  const leftMargin = 88;
  const rightMargin = 88;
  const xLeft = boxX + leftMargin;
  const xRight = boxX + boxW - rightMargin;
  const maxWidth = Math.max(560, xRight - xLeft);
  const maxBlockH = boxH * ENGAGEMENT_DEBATE_STACK_BLOCK_H;
  const minSize = ENGAGEMENT_DEBATE_STACK_MIN_PX;
  const maxSize = ENGAGEMENT_DEBATE_STACK_MAX_PX;
  const lineGapMult = 1.22;

  let size = maxSize;
  let stmtLines: string[] = [];
  for (let iter = 0; iter < 32; iter++) {
    stmtLines = wrapTextToLines(statement, size, maxWidth, fontFamily);
    const lh = Math.round(size * lineGapMult);
    const gapPx = Math.round(size * 0.55);
    const totalH = stmtLines.length * lh + gapPx + lh;
    if (totalH <= maxBlockH || size <= minSize) break;
    size -= 2;
  }
  size = Math.max(minSize, Math.min(maxSize, size));
  stmtLines = wrapTextToLines(statement, size, maxWidth, fontFamily);

  const lh = Math.round(size * lineGapMult);
  const gapPx = Math.round(size * 0.55);
  const totalBlockH = stmtLines.length * lh + gapPx + lh;
  const startY = Math.round(boxY + (boxH - totalBlockH) / 2 + size * 0.35);

  const stmtSvg = stmtLines
    .map((line, i) => {
      const y = startY + i * lh;
      return `<text x="${xLeft}" y="${y}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${size}" font-weight="700" fill="${escapeXML(theme.textMuted)}">${escapeXML(line)}</text>`;
    })
    .join("\n  ");

  const footY = startY + stmtLines.length * lh + gapPx;
  const footSvg = `<text x="${xLeft}" y="${footY}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${size}" font-weight="700" fill="${escapeXML(theme.textPrimary)}">${escapeXML(footer)}</text>`;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  ${getSvgDocumentFontStyleBlock()}
  <rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" fill="${escapeXML(theme.canvasBg)}" />
  ${stmtSvg}
  ${footSvg}
</svg>
`.trim();

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderHotTakeLayout(
  params: EngagementLayoutParams
): Promise<Buffer> {
  const { template, theme } = params;
  const statement = String(params.topText ?? "").trim();
  if (!statement) {
    throw new Error("hot_take requires topText");
  }
  const header = "Hot take:";
  const fontFamily = normalizeFontFamily();

  const boxX = template.slot_1_x ?? 0;
  const boxY = template.slot_1_y ?? 0;
  const boxW = template.slot_1_width ?? CANVAS;
  const boxH = template.slot_1_height ?? CANVAS;
  const leftMargin = 88;
  const rightMargin = 88;
  const xLeft = boxX + leftMargin;
  const xRight = boxX + boxW - rightMargin;
  const maxWidth = Math.max(560, xRight - xLeft);
  const maxBlockH = boxH * 0.78;
  const minSize = 36;
  const lineGapMult = 1.22;

  let headSize = 52;
  let stmtSize = 58;
  let stmtLines: string[] = [];
  for (let iter = 0; iter < 28; iter++) {
    stmtLines = wrapTextToLines(statement, stmtSize, maxWidth, fontFamily);
    const lhHead = Math.round(headSize * lineGapMult);
    const lhStmt = Math.round(stmtSize * lineGapMult);
    const gapPx = Math.round(stmtSize * 0.45);
    const totalH = lhHead + gapPx + stmtLines.length * lhStmt;
    if (totalH <= maxBlockH || stmtSize <= minSize) break;
    stmtSize -= 2;
    headSize = Math.max(minSize, stmtSize - 8);
  }
  headSize = Math.max(minSize, Math.min(52, headSize));
  stmtSize = Math.max(minSize, Math.min(58, stmtSize));
  stmtLines = wrapTextToLines(statement, stmtSize, maxWidth, fontFamily);

  const lhHead = Math.round(headSize * lineGapMult);
  const lhStmt = Math.round(stmtSize * lineGapMult);
  const gapPx = Math.round(stmtSize * 0.45);
  const totalBlockH = lhHead + gapPx + stmtLines.length * lhStmt;
  const startY = Math.round(boxY + (boxH - totalBlockH) / 2 + headSize * 0.35);

  const headY = startY;
  const headSvg = `<text x="${xLeft}" y="${headY}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${headSize}" font-weight="700" fill="${escapeXML(theme.textPrimary)}">${escapeXML(header)}</text>`;

  const stmtStartY = startY + lhHead + gapPx;
  const stmtSvg = stmtLines
    .map((line, i) => {
      const y = stmtStartY + i * lhStmt;
      return `<text x="${xLeft}" y="${y}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${stmtSize}" font-weight="700" fill="${escapeXML(theme.textMuted)}">${escapeXML(line)}</text>`;
    })
    .join("\n  ");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  ${getSvgDocumentFontStyleBlock()}
  <rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" fill="${escapeXML(theme.canvasBg)}" />
  ${headSvg}
  ${stmtSvg}
</svg>
`.trim();

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderBirthdayNamesListLayout(
  params: EngagementLayoutParams
): Promise<Buffer> {
  const { template, theme } = params;
  const subject = String(params.topText ?? "").trim();
  const reward = String(params.bottomText ?? "").trim();
  const names = Array.isArray(params.names)
    ? params.names.map((n) => String(n ?? "").trim()).filter(Boolean)
    : [];

  if (!subject || !reward) {
    throw new Error("birthday_names_list requires topText and bottomText");
  }
  if (names.length !== 24) {
    throw new Error("birthday_names_list requires exactly 24 names");
  }

  const fontFamily = normalizeFontFamily();
  const titleFontSize = Number.isFinite(template.font_size)
    ? Math.max(44, Math.min(56, Number(template.font_size)))
    : 50;
  const nameFontSize = Math.max(30, Math.round(titleFontSize * 0.62));

  const boxX = template.slot_1_x ?? 0;
  const boxY = template.slot_1_y ?? 0;
  const boxW = template.slot_1_width ?? CANVAS;
  const boxH = template.slot_1_height ?? CANVAS;

  const leftMargin = 90;
  const rightMargin = 90;
  const xLeft = boxX + leftMargin;
  const xRight = boxX + boxW - rightMargin;
  const contentWidth = Math.max(700, xRight - xLeft);
  const contentCenterX = xLeft + contentWidth / 2;

  const headline = `These ${subject} deserve ${reward} for their birthday`;

  const wrapHeadline = (
    text: string,
    maxWidth: number,
    fontSize: number
  ): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const w = measureLineWidthPx(candidate, fontSize, fontFamily);
      if (w <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  // Controlled headline width + clean wrapping for predictable composition.
  const headlineMaxWidth = Math.min(contentWidth, Math.round(boxW * 0.80));
  let headlineSize = titleFontSize;
  let headlineLines = wrapHeadline(headline, headlineMaxWidth, headlineSize);
  while (headlineLines.length > 2 && headlineSize > 42) {
    headlineSize -= 1;
    headlineLines = wrapHeadline(headline, headlineMaxWidth, headlineSize);
  }
  if (headlineLines.length > 2) {
    // Keep visual structure stable even for long generated text.
    headlineLines = [headlineLines[0] ?? "", headlineLines.slice(1).join(" ")];
  }

  const headlineTopY = Math.round(boxY + boxH * 0.13);
  const headlineLineHeight = Math.round(headlineSize * 1.16);
  const headlineBlockHeight = headlineLineHeight * headlineLines.length;
  const headlineBottomY = headlineTopY + headlineBlockHeight;
  const namesTopY = headlineBottomY + Math.round(boxH * 0.05);
  const namesBottomY = Math.round(boxY + boxH * 0.87);
  const rowCount = 6; // 24 names => 4 columns x 6 rows (best readability balance)
  const rowGap = Math.round((namesBottomY - namesTopY) / (rowCount - 1));
  const colCount = 4;
  const colGap = 28;
  const minColWidth = 140;
  const maxColWidth = 190;
  const columnTextWidths = Array.from({ length: colCount }, (_, col) => {
    const start = col * rowCount;
    const end = start + rowCount;
    const colNames = names.slice(start, end);
    const widest = colNames.reduce((max, name) => {
      const w = measureLineWidthPx(name, nameFontSize, fontFamily);
      return Math.max(max, w);
    }, 0);
    return Math.max(minColWidth, Math.min(maxColWidth, Math.ceil(widest)));
  });
  const totalGridWidth =
    columnTextWidths.reduce((sum, w) => sum + w, 0) + colGap * (colCount - 1);
  const centeredStartX = Math.round((CANVAS - totalGridWidth) / 2);
  // Optical correction: left-aligned names can read slightly left-heavy even when
  // mathematically centered, so apply a tiny rightward nudge.
  const GRID_OPTICAL_OFFSET_X = 8;
  const gridStartX = centeredStartX + GRID_OPTICAL_OFFSET_X;
  const colXs: number[] = [];
  let cursorX = gridStartX;
  for (let col = 0; col < colCount; col++) {
    colXs.push(cursorX);
    cursorX += columnTextWidths[col] + colGap;
  }

  const rows: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const col = Math.floor(i / rowCount);
    const row = i % rowCount;
    const x = colXs[col] ?? xLeft;
    const y = namesTopY + row * rowGap;
    rows.push(
      `<text x="${x}" y="${y}" text-anchor="start" font-family="${escapeXML(fontFamily)}" font-size="${nameFontSize}" fill="${escapeXML(theme.textPrimary)}">${escapeXML(names[i] ?? "")}</text>`
    );
  }

  const headlineSvgLines = headlineLines
    .map((line, idx) => {
      const y = headlineTopY + idx * headlineLineHeight;
      return `<text x="${contentCenterX}" y="${y}" text-anchor="middle" font-family="${escapeXML(fontFamily)}" font-size="${headlineSize}" fill="${escapeXML(theme.textPrimary)}">${escapeXML(line)}</text>`;
    })
    .join("\n  ");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  ${getSvgDocumentFontStyleBlock()}
  <rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" fill="${escapeXML(theme.canvasBg)}" />
  ${headlineSvgLines}
  ${rows.join("\n  ")}
</svg>
`.trim();

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Engagement text templates are pure code-rendered text cards.
 * This renderer intentionally does NOT use the overlay-slot pipeline.
 */
export async function renderEngagementTextMemePng(
  params: RenderEngagementTextMemePngParams
): Promise<Buffer> {
  const textLayoutType = String(
    params.template.text_layout_type ?? "finish_sentence"
  )
    .trim()
    .toLowerCase();

  const renderer = ENGAGEMENT_LAYOUT_RENDERERS[textLayoutType];
  if (!renderer) {
    throw new Error(
      `Unsupported engagement_text text_layout_type: ${textLayoutType}`
    );
  }

  const theme = resolveEngagementTheme(params.engagementStyle);
  const buf = await renderer({ ...params, theme });
  if (!buf?.length) {
    throw new Error(
      `[render] renderEngagementTextMemePng produced empty buffer (${textLayoutType})`
    );
  }
  return buf;
}

