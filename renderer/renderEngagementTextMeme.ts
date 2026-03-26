import sharp from "sharp";
import { measureLineWidthPx } from "@/renderer/square-text-measure";
import type { MemeTemplateForRender } from "@/renderer/renderMemeTemplate";

const CANVAS = 1080;

function escapeXML(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeFontFamily(font?: string | null): string {
  const f = String(font ?? "").trim();
  if (!f) return "Arial, sans-serif";
  // SVG font-family lists are forgiving; keep it simple.
  return /sans-serif/i.test(f) ? f : `${f}, sans-serif`;
}

type RenderEngagementTextMemePngParams = {
  template: MemeTemplateForRender;
  keyword?: string | null;
  topText?: string | null;
  bottomText?: string | null;
  names?: string[];
};

type EngagementLayoutRenderer = (
  params: RenderEngagementTextMemePngParams
) => Promise<Buffer>;

const ENGAGEMENT_LAYOUT_RENDERERS: Record<string, EngagementLayoutRenderer> = {
  finish_sentence: renderFinishSentenceLayout,
  birthday_names_list: renderBirthdayNamesListLayout,
};

async function renderFinishSentenceLayout(
  params: RenderEngagementTextMemePngParams
): Promise<Buffer> {
  const { template, keyword } = params;

  // This layout is intentionally fixed to finish_sentence behavior.
  const fontFamily = normalizeFontFamily(template.font ?? "Arial");
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
  <rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" fill="#FFFFFF" />

  <text x="${xLeft}" y="${line1Y}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${fontSize}" fill="#000000">
    ${escapeXML(line1)}
  </text>

  <text x="${xLeft}" y="${line2Y}" text-anchor="start"
    font-family="${escapeXML(fontFamily)}"
    font-size="${fontSize}" fill="#000000">
    ${escapeXML(line2)}
  </text>

  <line x1="${underlineX}" y1="${underlineY}" x2="${underlineX + underlineWidth}" y2="${underlineY}"
    stroke="#000000" stroke-width="${underlineThickness}" stroke-linecap="round" />
</svg>
`.trim();

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderBirthdayNamesListLayout(
  params: RenderEngagementTextMemePngParams
): Promise<Buffer> {
  const { template } = params;
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

  const fontFamily = normalizeFontFamily(template.font ?? "Arial");
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
      `<text x="${x}" y="${y}" text-anchor="start" font-family="${escapeXML(fontFamily)}" font-size="${nameFontSize}" fill="#000000">${escapeXML(names[i] ?? "")}</text>`
    );
  }

  const headlineSvgLines = headlineLines
    .map((line, idx) => {
      const y = headlineTopY + idx * headlineLineHeight;
      return `<text x="${contentCenterX}" y="${y}" text-anchor="middle" font-family="${escapeXML(fontFamily)}" font-size="${headlineSize}" fill="#000000">${escapeXML(line)}</text>`;
    })
    .join("\n  ");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" fill="#FFFFFF" />
  ${headlineSvgLines}
  ${rows.join("\n  ")}
</svg>
`.trim();

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Engagement text templates are pure code-rendered text on white.
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

  return renderer(params);
}

