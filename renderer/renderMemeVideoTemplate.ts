import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
  renderTopCaptionOverlayPng,
  type MemeTemplateForRender,
} from "@/renderer/renderMemeTemplate";

type MemeVideoTemplateForRender = {
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
    canvas_width: t.canvas_width ?? 1080,
    canvas_height: t.canvas_height ?? 1080,
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

function normalizeText(v: string): string {
  return v.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  if (!text) return [];
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines) break;
    }
  }

  if (currentLine && lines.length < maxLines) lines.push(currentLine);
  return lines.slice(0, maxLines);
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
  const lineHeight = Math.round(fontSize * 1.2);
  const alignment = (params.template.alignment ?? "center").toLowerCase();
  const normalized = normalizeText(params.topText);
  const lines = wrapText(normalized, maxChars, maxLines);
  const textValue = lines.join("\n");
  const lineCount = Math.max(1, lines.length);
  const totalTextHeight = lineCount * lineHeight;
  const startY = Math.round(slotY + (slotHeight - totalTextHeight) / 2 + fontSize);
  const xExpr =
    alignment === "left"
      ? `${slotX + 20}`
      : alignment === "right"
        ? `${slotX + slotWidth - 20}-text_w`
        : `${slotX + slotWidth / 2}-text_w/2`;

  const textColor = hexToFfmpegColor(params.template.text_color);
  const strokeColor = hexToFfmpegColor(params.template.stroke_color);
  const strokeWidth = Number(params.template.stroke_width ?? 0);
  const escapedText = escapeDrawtextText(textValue || " ");
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
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "18",
          "-c:a",
          "copy",
          "-movflags",
          "+faststart",
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
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
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

