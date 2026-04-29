/**
 * Slot meme PNGs: SVG text as vector paths + Sharp composite (no `<text>`, no fontconfig).
 */
import sharp from "sharp";
import { wrapCaptionWithSoftEarlySplit } from "@/renderer/caption-wrap";
import { normalizeNobodyMeSetupSlots } from "@/lib/memes/normalize-nobody-me-setup-slots";
import { interTextToPathElement, interTextWidthPx } from "@/lib/rendering/text-to-path";
import {
  SVG_UTF8_XML_DECL,
  logSvgDebugSample,
  svgStringToUtf8Buffer,
} from "@/lib/rendering/svg-utf8";

/** DB-backed slot geometry + colors for Sharp path rendering. */
export type MemeTemplateForRender = {
  slug?: string | null;
  /** Present on DB-backed templates; used for mechanic-specific render paths. */
  meme_mechanic?: string | null;
  mechanic_group?: string | null;
  asset_type?: string | null;
  content_region_y?: number | null;
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

function normalizeRenderableText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€”/g, "—")
    .replace(/â€“/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

function getTextAnchor(alignment: string): "start" | "middle" | "end" {
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
    isTopCaption?: boolean;
    isOverlayOrSideCaption?: boolean;
    topCaptionOffsetY?: number;
    topCaptionX?: number;
    templateSlug?: string | null;
    isImage?: boolean;
    isVideo?: boolean;
    topRegionHeight?: number;
  }
) {
  if (!lines.length) return "";

  let fontSize = style.fontSize;
  if (style.isOverlayOrSideCaption && !style.isTopCaption) {
    const maxLineWidth = Math.max(...lines.map((line) => interTextWidthPx(line, fontSize)));
    const slotWidth = slot.width;
    if (maxLineWidth > slotWidth) {
      const scale = slotWidth / maxLineWidth;
      const newFontSize = Math.max(Math.floor(fontSize * scale), 32);
      fontSize = newFontSize;
    }
  }
  const lineHeight = Math.round(fontSize * 1.15);
  const inset = style.horizontalInset;
  const x = style.isTopCaption
    ? (style.topCaptionX ?? getXPosition({ x: slot.x, width: slot.width }, style.alignment, inset))
    : getXPosition({ x: slot.x, width: slot.width }, style.alignment, inset);
  const textAnchor = getTextAnchor(style.alignment);
  const totalTextHeight = lines.length * lineHeight;
  let startY = style.isTopCaption
    ? (style.topCaptionOffsetY ?? 0) + fontSize
    : slot.y + (slot.height - totalTextHeight) / 2 + fontSize;
  if (style.isImage && style.isTopCaption) {
    const slotTop = slot.y;
    const slotHeight = slot.height;
    startY = slotTop + (slotHeight - totalTextHeight) / 2 + fontSize;
    const TOP_BIAS = slotHeight * 0.08;
    startY = startY - TOP_BIAS;
    startY = Math.max(slotTop + 20, startY);
  }
  if (style.isVideo && style.isTopCaption) {
    const topRegionHeight = style.topRegionHeight ?? 200;
    const TOP_BIAS = topRegionHeight * 0.08;
    startY = (topRegionHeight - totalTextHeight) / 2 + fontSize + TOP_BIAS;
  }

  return lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      const ta = textAnchor;
      console.log("🚨 FINAL_TEXT_RENDER_VALUES", {
        slug: style.templateSlug ?? null,
        lines,
        x,
        y,
        alignment: style.alignment,
        textAnchor: ta,
        isTopCaption: Boolean(style.isTopCaption),
      });
      return interTextToPathElement(String(line), {
        x,
        y,
        fontSize,
        textAnchor: ta,
        fill: style.textColor,
        stroke: style.strokeWidth > 0 ? style.strokeColor : undefined,
        strokeWidth: style.strokeWidth > 0 ? style.strokeWidth : undefined,
      });
    })
    .join("");
}

function isIncompleteEnding(value: string): boolean {
  const lower = value.toLowerCase().trim();
  const badEndings = [
    "before you",
    "while the",
    "like youre",
    "like you are",
    "as you",
    "just as",
    "right as",
    "about to",
    "in the middle of",
    "when you",
  ];
  return badEndings.some((e) => lower.endsWith(e));
}

function wrapTextByWidth(text: string, maxWidth: number, fontSize: number): string[] {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = interTextWidthPx(testLine, fontSize);

    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
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

  console.log("[DEBUG TEXT BEFORE WRAP]", params.text);

  const mechanicGroup = String(params.template.mechanic_group ?? "").trim().toLowerCase();
  const isTopCaptionMechanic =
    mechanicGroup === "caption_relatable" || mechanicGroup === "reaction_implication";

  if (isTopCaptionMechanic && params.slotIndex === 0) {
    const canvasWidth = params.template.canvas_width ?? 0;
    const LEFT_PADDING = canvasWidth * 0.06;
    const RIGHT_PADDING = canvasWidth * 0.06;
    const MAX_TEXT_WIDTH = canvasWidth - LEFT_PADDING - RIGHT_PADDING;
    const lines = wrapTextByWidth(params.text, MAX_TEXT_WIDTH, params.fontSize);
    const lastLine = lines[lines.length - 1] ?? "";
    if (isIncompleteEnding(lastLine)) {
      console.warn("Top caption ends incompletely; preserving full text without trimming.");
    }
    console.log("[DEBUG TOP_CAPTION WRAP COMPARE]", {
      original: params.text,
      wrappedLines: lines,
      wordCountOriginal: params.text.split(/\s+/).filter(Boolean).length,
      wordCountWrapped: lines.join(" ").split(/\s+/).filter(Boolean).length,
    });
    console.log("TOP_CAPTION_STANDARD", lines);
    return lines;
  }

  if (params.slotIndex === 0) {
    return wrapCaptionWithSoftEarlySplit(params.text, params.maxChars, params.maxLines);
  }

  return wrapCaptionWithSoftEarlySplit(params.text, params.maxChars, params.maxLines);
}

function buildSVG(template: MemeTemplateForRender, slotTexts: SlotTexts) {
  const textLayoutType = String(template.text_layout_type ?? "").trim().toLowerCase();
  const isImage = String(template.asset_type ?? "").trim().toLowerCase() === "image";
  const isVideo = String(template.asset_type ?? "").trim().toLowerCase() === "video";
  const topRegionHeight =
    typeof template.content_region_y === "number" ? template.content_region_y : 200;
  const mechanicGroup = String(template.mechanic_group ?? "").trim().toLowerCase();
  let renderMode:
    | "top_caption"
    | "nobody_me"
    | "contrast_binary"
    | "contrast_multi"
    | "spatial_roles"
    | "default" = "default";

  switch (mechanicGroup) {
    case "caption_relatable":
    case "reaction_implication":
      renderMode = "top_caption";
      break;
    case "setup_punchline":
      renderMode = "nobody_me";
      break;
    case "contrast_binary":
      renderMode = "contrast_binary";
      break;
    case "contrast_multi":
      renderMode = "contrast_multi";
      break;
    case "spatial_roles":
      renderMode = "spatial_roles";
      break;
    default:
      renderMode = "default";
      break;
  }
  const isTopCaption = renderMode === "top_caption";
  const isOverlayOrSideCaption =
    textLayoutType === "overlay" || textLayoutType === "side_caption";
  const fontSize = isTopCaption ? 54 : template.font_size ?? 46;
  console.log("IMAGE FONT SIZE", {
    slug: template.slug,
    fontSize: fontSize,
  });
  const horizontalInset = isTopCaption ? 0 : 0;
  const horizontalPadding = template.canvas_width * 0.06;
  const minPadding = template.canvas_width * 0.04;
  const topCaptionX = isTopCaption ? Math.max(horizontalPadding, minPadding) : undefined;
  const topCaptionOffsetY = isTopCaption ? Math.round(template.canvas_height * 0.08) : 0;
  const alignment = isTopCaption
    ? "left"
    : template.alignment || "center";
  const textColor = template.text_color || "#000000";
  const strokeColor = template.stroke_color || "";
  const strokeWidth = template.stroke_width || 0;

  const style = {
    fontSize,
    alignment,
    horizontalInset,
    textColor,
    strokeColor,
    strokeWidth,
    isTopCaption,
    topCaptionX,
    topCaptionOffsetY,
  };

  const slot1Text = normalizeRenderableText(slotTexts.slot_1_text);
  const slot2Text = normalizeRenderableText(slotTexts.slot_2_text);
  const slot3Text = normalizeRenderableText(slotTexts.slot_3_text);

  const mechanic = String(template.meme_mechanic ?? "").trim().toLowerCase();
  const slug = String(template.slug ?? "").trim();
  console.log("TEMPLATE DEBUG - IN RENDER", {
    slug: template.slug,
    mechanic_group: template.mechanic_group,
    text_layout_type: template.text_layout_type,
  });
  console.log("🚨 ACTIVE_RENDER_FILE", {
    file: "renderer/renderMemeTemplate.ts::buildSVG",
    slug: template.slug ?? null,
    mechanic_group: template.mechanic_group ?? null,
    text_layout_type: template.text_layout_type ?? null,
  });
  if (mechanic === "nobody_me_setup" || slug === "victorian-nobody-me") {
    console.log("NOBODY_ME_RENDER", {
      slot_1_text: slot1Text,
      slot_2_text: slot2Text,
    });
  }

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
        alignment: style.isTopCaption ? "left" : style.alignment,
        isOverlayOrSideCaption,
        templateSlug: template.slug ?? null,
        isImage,
        isVideo,
        topRegionHeight,
      });
    })
    .join("");

  const hasInputText = Boolean(slot1Text || slot2Text || slot3Text);
  if (hasInputText && !renderedText.trim()) {
    throw new Error(
      `[render] No renderable text slots for template slug=${String(template.slug ?? "unknown")}`
    );
  }

  logSvgDebugSample(slot1Text || slot2Text || slot3Text);

  console.log("[render] SVG text as paths (Inter outlines, no fontconfig)");
  const svgBody = `${renderedText}`;
  const svg = `${SVG_UTF8_XML_DECL}
<svg xmlns="http://www.w3.org/2000/svg" width="${template.canvas_width}" height="${template.canvas_height}">
  ${renderedText}
</svg>
  `;
  console.log("🚨 SVG_RENDER_DEBUG", {
    slug: template.slug ?? null,
    svgLength: svg.length,
    renderedTextLength: svgBody.length,
    hasTextAnchorStart: svg.includes('text-anchor="start"'),
    hasPathElements: svg.includes("<path"),
  });

  return svg;
}

export async function renderMemePNGFromTemplate(params: {
  baseImageBuffer: Buffer;
  template: MemeTemplateForRender;
  topText: string;
  bottomText: string | null;
  slot_3_text?: string;
}) {
  const mechanic = String(params.template.meme_mechanic ?? "").trim().toLowerCase();
  const slug = String(params.template.slug ?? "").trim();
  const isNobodyMeTemplate =
    mechanic === "nobody_me_setup" || slug === "victorian-nobody-me";
  const nobodySlots = isNobodyMeTemplate
    ? normalizeNobodyMeSetupSlots(params.topText, params.bottomText)
    : null;

  const svg = buildSVG(
    params.template,
    {
    slot_1_text: nobodySlots?.top ?? params.topText,
    slot_2_text: nobodySlots?.bottom ?? (params.bottomText ?? ""),
    slot_3_text: params.slot_3_text ?? "",
    }
  );

  const svgBuffer = svgStringToUtf8Buffer(svg);
  const out = await sharp(params.baseImageBuffer)
    .composite([{ input: svgBuffer }])
    .png()
    .toBuffer();
  if (!out?.length) {
    throw new Error("[render] renderMemePNGFromTemplate produced empty buffer");
  }
  return out;
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

  const out = await sharp(svgStringToUtf8Buffer(svg)).png().toBuffer();
  if (!out?.length) {
    throw new Error("[render] renderTopCaptionOverlayPng produced empty buffer");
  }
  return out;
}

