import sharp from "sharp";
import { wrapCaptionWithSoftEarlySplit, wrapSquareTopCaptionScoped } from "@/renderer/caption-wrap";

export type MemeTemplateForRender = {
  slug?: string | null;
  canvas_width: number;
  canvas_height: number;
  height_bucket?: string | null;
  template_family?: string | null;
  text_layout_type?: string | null;
  font_size?: number | null;
  alignment?: string | null;
  text_color?: string | null;
  stroke_color?: string | null;
  stroke_width?: number | null;
  font?: string | null;

  slot_1_x?: number | null;
  slot_1_y?: number | null;
  slot_1_width?: number | null;
  slot_1_height?: number | null;
  slot_1_max_chars?: number | null;
  slot_1_max_lines?: number | null;

  slot_2_x?: number | null;
  slot_2_y?: number | null;
  slot_2_width?: number | null;
  slot_2_height?: number | null;
  slot_2_max_chars?: number | null;
  slot_2_max_lines?: number | null;

  slot_3_x?: number | null;
  slot_3_y?: number | null;
  slot_3_width?: number | null;
  slot_3_height?: number | null;
  slot_3_max_chars?: number | null;
  slot_3_max_lines?: number | null;
};

type SlotTexts = {
  slot_1_text: string;
  slot_2_text?: string | null;
  slot_3_text?: string | null;
};

function escapeXML(str: unknown) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getTextAnchor(alignment: string | null | undefined) {
  if (alignment === "left") return "start";
  if (alignment === "right") return "end";
  return "middle";
}

function getXPosition(
  slot: { x: number; width: number },
  alignment: string,
  horizontalInset: number
) {
  if (alignment === "left") return slot.x + horizontalInset;
  if (alignment === "right") return slot.x + slot.width - horizontalInset;
  return slot.x + slot.width / 2;
}

function renderLines(
  lines: string[],
  slot: {
    x: number;
    y: number;
    width: number;
    height: number;
    maxChars: number;
    maxLines: number;
  },
  style: {
    fontSize: number;
    alignment: string;
    horizontalInset: number;
    textColor: string;
    strokeColor: string;
    strokeWidth: number;
    fontFamily: string;
  }
) {
  if (!lines.length) return "";

  const fontSize = style.fontSize;
  const lineHeight = Math.round(fontSize * 1.15);
  const inset = style.horizontalInset;
  const x = getXPosition({ x: slot.x, width: slot.width }, style.alignment, inset);
  const textAnchor = getTextAnchor(style.alignment);
  const totalTextHeight = lines.length * lineHeight;
  const startY = slot.y + (slot.height - totalTextHeight) / 2 + fontSize;

  return lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      const strokeAttrs =
        style.strokeWidth > 0 && style.strokeColor
          ? `stroke="${style.strokeColor}" stroke-width="${style.strokeWidth}" paint-order="stroke"`
          : "";
      return `<text x="${x}" y="${y}" class="caption" text-anchor="${textAnchor}" ${strokeAttrs}>${escapeXML(
        line
      )}</text>`;
    })
    .join("");
}

function wrapImageSlotText(params: {
  text: string;
  maxChars: number;
  maxLines: number;
  slotWidth: number;
  fontSize: number;
  template: MemeTemplateForRender;
  slotIndex: number;
}): string[] {
  if (!params.text) return [];

  // Keep image slot-1 behavior aligned with video wrapping:
  // medium + top_caption uses one fixed wrapping strategy for consistency.
  if (params.slotIndex === 0) {
    const templateSlug = (params.template as { slug?: string | null }).slug ?? null;
    const isMediumTopCaption =
      String(params.template.height_bucket ?? "").trim().toLowerCase() === "medium" &&
      String(params.template.text_layout_type ?? "").trim().toLowerCase() === "top_caption";
    if (isMediumTopCaption) {
      const lines = wrapCaptionWithSoftEarlySplit(params.text, 37, 2);
      console.log("VIDEO WRAP PATH", {
        file: "renderer/renderMemeTemplate.ts",
        function: "wrapImageSlotText",
        slug: templateSlug,
        height_bucket: params.template.height_bucket ?? null,
        layout: params.template.text_layout_type ?? null,
        family: params.template.template_family ?? null,
        text: params.text,
        selectedStrategy: "medium_top_caption_forced_fallback_37x2",
        lines,
      });
      return lines;
    }

    const scoped = wrapSquareTopCaptionScoped({
      text: params.text,
      maxChars: params.maxChars,
      maxLines: params.maxLines,
      slotWidthPx: params.slotWidth,
      fontSize: params.fontSize,
      fontFamily: params.template.font ?? null,
      templateFamily: params.template.template_family ?? null,
      textLayoutType: params.template.text_layout_type ?? null,
    });
    const lines =
      scoped && scoped.length > 0
        ? scoped
        : wrapCaptionWithSoftEarlySplit(params.text, params.maxChars, params.maxLines);
    console.log("VIDEO WRAP PATH", {
      file: "renderer/renderMemeTemplate.ts",
      function: "wrapImageSlotText",
      slug: templateSlug,
      height_bucket: params.template.height_bucket ?? null,
      layout: params.template.text_layout_type ?? null,
      family: params.template.template_family ?? null,
      text: params.text,
      selectedStrategy: scoped && scoped.length > 0 ? "scoped" : "fallback",
      lines,
    });
    return lines;
  }

  return wrapCaptionWithSoftEarlySplit(params.text, params.maxChars, params.maxLines);
}

function buildSVG(template: MemeTemplateForRender, slotTexts: SlotTexts) {
  const fontSize = template.font_size ?? 46;
  console.log("IMAGE FONT SIZE", {
    slug: template.slug,
    fontSize: fontSize,
  });
  const isTopCaptionLayout =
    String(template.text_layout_type ?? "").trim().toLowerCase() === "top_caption";
  const horizontalInset = isTopCaptionLayout ? 8 : 0;
  const alignment = isTopCaptionLayout
    ? "left"
    : template.alignment || "center";
  const textColor = template.text_color || "#000000";
  const strokeColor = template.stroke_color || "";
  const strokeWidth = template.stroke_width || 0;
  const fontFamily = template.font || "Arial";

  const style = {
    fontSize,
    alignment,
    horizontalInset,
    textColor,
    strokeColor,
    strokeWidth,
    fontFamily,
  };

  const slot1Text = slotTexts.slot_1_text || "";
  const slot2Text = slotTexts.slot_2_text || "";
  const slot3Text = slotTexts.slot_3_text || "";

  const slots: Array<{
    text: string;
    maxChars: number;
    maxLines: number;
    x: number | null | undefined;
    y: number | null | undefined;
    width: number | null | undefined;
    height: number | null | undefined;
  }> = [
    {
      text: slot1Text,
      maxChars: template.slot_1_max_chars ?? 20,
      maxLines: template.slot_1_max_lines ?? 2,
      x: template.slot_1_x,
      y: template.slot_1_y,
      width: template.slot_1_width,
      height: template.slot_1_height,
    },
    {
      text: slot2Text,
      maxChars: template.slot_2_max_chars ?? 20,
      maxLines: template.slot_2_max_lines ?? 2,
      x: template.slot_2_x,
      y: template.slot_2_y,
      width: template.slot_2_width,
      height: template.slot_2_height,
    },
    {
      text: slot3Text,
      maxChars: template.slot_3_max_chars ?? 20,
      maxLines: template.slot_3_max_lines ?? 2,
      x: template.slot_3_x,
      y: template.slot_3_y,
      width: template.slot_3_width,
      height: template.slot_3_height,
    },
  ].filter(
    (slot) =>
      slot.text &&
      slot.x != null &&
      slot.y != null &&
      slot.width != null &&
      slot.height != null
  );

  const renderedText = slots
    .map((slot, slotIndex) => {
      const lines = wrapImageSlotText({
        text: slot.text,
        maxChars: slot.maxChars,
        maxLines: slot.maxLines,
        slotWidth: slot.width ?? 0,
        fontSize,
        template,
        slotIndex,
      });
      if (
        template.slot_1_x != null &&
        template.slot_1_y != null &&
        slot.x === template.slot_1_x &&
        slot.y === template.slot_1_y
      ) {
        console.log("TEXT RENDER TEST", {
          slug: template.slug,
          fontSize,
          lines,
        });
      }
      return renderLines(lines, slot as any, {
        ...style,
        alignment: style.alignment,
      });
    })
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${template.canvas_width}" height="${template.canvas_height}">
  <style>
    .caption {
      fill: ${style.textColor};
      font-size: ${style.fontSize}px;
      font-family: ${style.fontFamily}, sans-serif;
    }
  </style>
  ${renderedText}
</svg>
  `;
}

export async function renderMemePNGFromTemplate(params: {
  baseImageBuffer: Buffer;
  template: MemeTemplateForRender;
  topText: string;
  bottomText: string | null;
  slot_3_text?: string;
}) {
  const svg = buildSVG(
    params.template,
    {
    slot_1_text: params.topText,
    slot_2_text: params.bottomText ?? "",
    slot_3_text: params.slot_3_text ?? "",
    }
  );

  const svgBuffer = Buffer.from(svg);
  return sharp(params.baseImageBuffer)
    .composite([{ input: svgBuffer }])
    .png()
    .toBuffer();
}

/** Transparent PNG (full canvas) with slot-1 caption only — for video overlay when ffmpeg lacks drawtext. */
export async function renderTopCaptionOverlayPng(params: {
  template: MemeTemplateForRender;
  topText: string;
}): Promise<Buffer> {
  console.log("VIDEO OVERLAY FALLBACK TEMPLATE", {
    slug: params.template.slug ?? null,
    height_bucket: params.template.height_bucket ?? null,
    layout: params.template.text_layout_type ?? null,
    family: params.template.template_family ?? null,
  });
  const svg = buildSVG(params.template, {
    slot_1_text: params.topText,
    slot_2_text: "",
    slot_3_text: "",
  });

  return sharp(Buffer.from(svg)).png().toBuffer();
}

