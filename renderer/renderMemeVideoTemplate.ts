import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
  renderTopCaptionOverlayPng,
  type MemeTemplateForRender,
} from "@/renderer/renderMemeTemplate";
import { wrapCaptionWithSoftEarlySplit, wrapSquareTopCaptionScoped } from "@/renderer/caption-wrap";

type MemeVideoTemplateForRender = {
  slug?: string | null;
  height_bucket?: string | null;
  template_family?: string | null;
  text_layout_type?: string | null;
  canvas_width?: number | null;
  canvas_height?: number | null;
  slot_1_x?: number | null;
  slot_1_y?: number | null;
  slot_1_width?: number | null;
  slot_1_height?: number | null;
  slot_1_max_chars?: number | null;
  slot_1_max_lines?: number | null;
  font?: string | null;
  font_size?: number | null;
  alignment?: string | null;
  text_color?: string | null;
  stroke_color?: string | null;
  stroke_width?: number | null;
};

function toMemeTemplateForRender(
  t: MemeVideoTemplateForRender
): MemeTemplateForRender {
  return {
    slug: t.slug ?? null,
    canvas_width: t.canvas_width ?? 1080,
    canvas_height: t.canvas_height ?? 1080,
    height_bucket: t.height_bucket ?? null,
    template_family: t.template_family ?? null,
    text_layout_type: t.text_layout_type ?? null,
    font_size: t.font_size,
    alignment: t.alignment,
    text_color: t.text_color,
    stroke_color: t.stroke_color,
    stroke_width: t.stroke_width,
    font: t.font,
    slot_1_x: t.slot_1_x,
    slot_1_y: t.slot_1_y,
    slot_1_width: t.slot_1_width,
    slot_1_height: t.slot_1_height,
    slot_1_max_chars: t.slot_1_max_chars,
    slot_1_max_lines: t.slot_1_max_lines,
  };
}

function hexToFfmpegColor(input: string | null | undefined): string {
  const color = String(input ?? "").trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(color)) return "white";
  return `0x${color.slice(1)}`;
}

function escapeDrawtextText(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n");
}

function getExecErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

function isDrawtextUnavailable(error: unknown): boolean {
  const message = getExecErrorMessage(error).toLowerCase();
  return (
    message.includes("no such filter: 'drawtext'") ||
    message.includes("filter not found")
  );
}

/** H.264 + yuv420p is what QuickTime / Apple players expect for broad MP4 compatibility. */
const H264_QUICKTIME_FRIENDLY = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "18",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
] as const;

export async function renderMemeMP4FromTemplate(params: {
  baseVideoBuffer: Buffer;
  template: MemeVideoTemplateForRender;
  topText: string;
}): Promise<Buffer> {
  const slotX = params.template.slot_1_x ?? 80;
  const slotY = params.template.slot_1_y ?? 65;
  const slotWidth = params.template.slot_1_width ?? 920;
  const slotHeight = params.template.slot_1_height ?? 170;
  const maxChars = params.template.slot_1_max_chars ?? 56;
  const maxLines = params.template.slot_1_max_lines ?? 2;
  const fontSize = params.template.font_size ?? 46;
  console.log("VIDEO FONT SIZE", {
    slug: params.template.slug,
    fontSize: fontSize,
  });
  const lineHeight = Math.round(fontSize * 1.15);
  const isMediumTopCaption =
    String(params.template.height_bucket ?? "").trim().toLowerCase() === "medium" &&
    String(params.template.text_layout_type ?? "").trim().toLowerCase() === "top_caption";
  const scoped = wrapSquareTopCaptionScoped({
    text: params.topText,
    maxChars,
    maxLines,
    slotWidthPx: slotWidth,
    fontSize,
    fontFamily: params.template.font ?? null,
    templateFamily: params.template.template_family ?? null,
    textLayoutType: params.template.text_layout_type ?? null,
  });
  const safeLines = isMediumTopCaption
    ? wrapCaptionWithSoftEarlySplit(params.topText, 37, 2)
    : scoped.length > 0
      ? scoped
      : wrapCaptionWithSoftEarlySplit(params.topText, maxChars, maxLines);
  console.log("VIDEO WRAP PATH", {
    file: "renderer/renderMemeVideoTemplate.ts",
    function: "renderMemeMP4FromTemplate",
    slug: (params.template as { slug?: string | null }).slug ?? null,
    height_bucket: params.template.height_bucket ?? null,
    layout: params.template.text_layout_type ?? null,
    family: params.template.template_family ?? null,
    text: params.topText,
    selectedStrategy: isMediumTopCaption
      ? "medium_top_caption_forced_fallback_37x2"
      : scoped.length > 0
        ? "scoped"
        : "fallback",
    lines: safeLines,
  });
  const isTopCaptionLayout =
    String(params.template.text_layout_type ?? "").trim().toLowerCase() === "top_caption";
  const horizontalInset = isTopCaptionLayout ? 8 : 0;
  const alignment = isTopCaptionLayout
    ? "left"
    : (params.template.alignment ?? "center").toLowerCase();
  console.log("TEXT RENDER TEST", {
    slug: params.template.slug,
    fontSize,
    lines: safeLines,
  });
  const drawtextText = safeLines.join("\\n");
  console.log("FFMPEG TEXT INPUT", drawtextText);
  const lineCount = Math.max(1, safeLines.length);
  const totalTextHeight = lineCount * lineHeight;
  const startY = Math.round(slotY + (slotHeight - totalTextHeight) / 2 + fontSize);
  const xExpr =
    alignment === "left"
      ? `${slotX + horizontalInset}`
      : alignment === "right"
        ? `${slotX + slotWidth - horizontalInset}-text_w`
        : `${slotX + slotWidth / 2}-text_w/2`;

  const textColor = hexToFfmpegColor(params.template.text_color);
  const strokeColor = hexToFfmpegColor(params.template.stroke_color);
  const strokeWidth = Number(params.template.stroke_width ?? 0);
  const escapedText = escapeDrawtextText(drawtextText || " ");
  const drawtext = [
    `drawtext=text='${escapedText}'`,
    `x=${xExpr}`,
    `y=${startY}`,
    `fontsize=${fontSize}`,
    `fontcolor=${textColor}`,
    `line_spacing=${Math.max(0, lineHeight - fontSize)}`,
    `box=0`,
    strokeWidth > 0 ? `borderw=${strokeWidth}` : "",
    strokeWidth > 0 ? `bordercolor=${strokeColor}` : "",
  ]
    .filter(Boolean)
    .join(":");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meme-video-"));
  const inputPath = path.join(tempDir, "input.mp4");
  const outputPath = path.join(tempDir, "output.mp4");
  const overlayPath = path.join(tempDir, "overlay.png");

  try {
    fs.writeFileSync(inputPath, params.baseVideoBuffer);
    try {
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-i",
          inputPath,
          "-vf",
          drawtext,
          ...H264_QUICKTIME_FRIENDLY,
          "-c:a",
          "copy",
          outputPath,
        ],
        { stdio: "pipe" }
      );
    } catch (error) {
      if (!isDrawtextUnavailable(error)) {
        throw error;
      }

      // FFmpeg without libfreetype: burn in caption via Sharp SVG → PNG + overlay filter.
      try {
        const overlayBuf = await renderTopCaptionOverlayPng({
          template: toMemeTemplateForRender(params.template),
          topText: params.topText,
        });
        fs.writeFileSync(overlayPath, overlayBuf);
        execFileSync(
          "ffmpeg",
          [
            "-y",
            "-i",
            inputPath,
            "-i",
            overlayPath,
            "-filter_complex",
            "[0:v][1:v]overlay=0:0:format=auto",
            ...H264_QUICKTIME_FRIENDLY,
            "-c:a",
            "copy",
            outputPath,
          ],
          { stdio: "pipe" }
        );
      } catch (overlayError) {
        console.warn(
          "[meme-video] PNG overlay render failed; using raw video (no caption)",
          overlayError
        );
        execFileSync(
          "ffmpeg",
          [
            "-y",
            "-i",
            inputPath,
            "-c:v",
            "copy",
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
            outputPath,
          ],
          { stdio: "pipe" }
        );
      }
    }
    return fs.readFileSync(outputPath);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // no-op
    }
  }
}

