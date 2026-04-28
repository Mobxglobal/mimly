import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import sharp from "sharp";
import {
  renderTopCaptionOverlayPng,
  type MemeTemplateForRender,
} from "@/renderer/renderMemeTemplate";
import { warnCanvasUnavailableOnce } from "@/lib/rendering/fonts";

// Force Vercel to bundle ffmpeg binary
const __ffmpeg_bundle_hint = path.join(process.cwd(), "public/bin/ffmpeg");

function resolveFfmpegPath(): string {
  // Local dev (Mac)
  if (process.platform === "darwin") {
    return "ffmpeg";
  }

  // Vercel / Linux
  const sourcePath = __ffmpeg_bundle_hint;
  const targetPath = "/tmp/ffmpeg";

  console.log("🚨 CHECKING FFMPEG SOURCE", sourcePath, fs.existsSync(sourcePath));

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`FFMPEG NOT FOUND at ${sourcePath}`);
  }

  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(sourcePath, targetPath);
    fs.chmodSync(targetPath, 0o755);
  }

  return targetPath;
}

type MemeVideoTemplateForRender = {
  slug?: string | null;
  meme_mechanic?: string | null;
  mechanic_group?: string | null;
  asset_type?: string | null;
  content_region_y?: number | null;
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
    meme_mechanic: t.meme_mechanic ?? null,
    mechanic_group: t.mechanic_group ?? null,
    asset_type: t.asset_type ?? null,
    content_region_y: t.content_region_y ?? null,
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

/** H.264 + yuv420p is what QuickTime / Apple players expect for broad MP4 compatibility. */
const H264_QUICKTIME_FRIENDLY = [
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-crf",
  "28",
  "-tune",
  "zerolatency",
  "-threads",
  "0",
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
  warnCanvasUnavailableOnce();
  const ffmpegPath = resolveFfmpegPath();
  console.log("🚨 USING FFMPEG PATH", ffmpegPath);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meme-video-"));
  const inputPath = path.join(tempDir, "input.mp4");
  const outputPath = path.join(tempDir, "output.mp4");
  const overlayPath = path.join(tempDir, "overlay.png");
  const firstFramePath = path.join(tempDir, "first-frame.png");
  const debugFramePath = path.join(tempDir, "debug-frame-before-ffmpeg.png");

  try {
    fs.writeFileSync(inputPath, params.baseVideoBuffer);
    const renderTemplate = toMemeTemplateForRender(params.template);
    console.log("VIDEO TEMPLATE DEBUG", {
      slug: renderTemplate.slug,
      mechanic_group: renderTemplate.mechanic_group,
      text_layout_type: renderTemplate.text_layout_type,
    });
    const overlayBuf = await renderTopCaptionOverlayPng({
      template: renderTemplate,
      topText: params.topText,
    });
    fs.writeFileSync(overlayPath, overlayBuf);

    // Debug probe: save one composed frame before final ffmpeg video processing.
    try {
      execFileSync(
        ffmpegPath,
        [
          "-y",
          "-i",
          inputPath,
          "-frames:v",
          "1",
          firstFramePath,
        ],
        { stdio: "pipe" }
      );
      const debugFrame = await sharp(firstFramePath)
        .composite([{ input: overlayBuf, left: 0, top: 0, blend: "over" }])
        .png()
        .toBuffer();
      fs.writeFileSync(debugFramePath, debugFrame);
      console.log("[video-debug] wrote pre-ffmpeg frame", { debugFramePath });
    } catch (debugErr) {
      console.warn("[video-debug] failed to write pre-ffmpeg frame", debugErr);
    }

    execFileSync(
      ffmpegPath,
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

    return fs.readFileSync(outputPath);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // no-op
    }
  }
}

