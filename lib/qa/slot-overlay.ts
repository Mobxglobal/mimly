import sharp from "sharp";
import { getSvgDocumentFontStyleBlock } from "@/lib/rendering/fonts";
import type { MemeTemplateForRender } from "@/renderer/renderMemeTemplate";

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Debug overlay (observation only) — not used by production renderers.
 */
export async function compositeSlotBoundingOverlayPng(
  basePng: Buffer,
  template: MemeTemplateForRender
): Promise<Buffer> {
  const W = template.canvas_width ?? 1080;
  const H = template.canvas_height ?? 1080;
  const align = String(template.alignment ?? "center").trim() || "center";

  const slots: Array<{
    n: number;
    x: number | null | undefined;
    y: number | null | undefined;
    w: number | null | undefined;
    h: number | null | undefined;
  }> = [
    { n: 1, x: template.slot_1_x, y: template.slot_1_y, w: template.slot_1_width, h: template.slot_1_height },
    { n: 2, x: template.slot_2_x, y: template.slot_2_y, w: template.slot_2_width, h: template.slot_2_height },
    { n: 3, x: template.slot_3_x, y: template.slot_3_y, w: template.slot_3_width, h: template.slot_3_height },
  ];

  let body = "";
  for (const s of slots) {
    if (s.x == null || s.y == null || s.w == null || s.h == null) continue;
    body += `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="rgba(255,59,48,0.92)" stroke-width="3"/>`;
    const label = `slot ${s.n}  x=${s.x} y=${s.y}  ${s.w}×${s.h}  align=${align}`;
    body += `<text x="${s.x + 6}" y="${Math.min(s.y + 22, H - 4)}" fill="rgba(255,59,48,0.95)" font-size="18" font-family="Arial, Helvetica, sans-serif">${escapeXml(label)}</text>`;
  }

  if (!body) {
    return basePng;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${getSvgDocumentFontStyleBlock()}${body}</svg>`;
  const overlay = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(basePng).composite([{ input: overlay, blend: "over" }]).png().toBuffer();
}
