import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createWorkspaceAdminClient } from "@/lib/workspace/auth";
import type { MemeOutputFormat } from "@/lib/memes/meme-output-formats";
import { mapMemeTemplateRowForRender } from "@/lib/memes/map-meme-template-row-for-render";
import { renderMemePNGFromTemplate } from "@/renderer/renderMemeTemplate";
import { renderMemeMP4FromTemplate } from "@/renderer/renderMemeVideoTemplate";
import { renderSquareTextMemePng } from "@/renderer/renderSquareTextMeme";
import { pickTemplateSimple } from "@/lib/generation/v2/template-picker";
import { buildSimplePrompt } from "@/lib/generation/v2/prompt-builder";
import { generateTextFromTemplate } from "@/lib/generation/v2/generator";
import { extractMetadata } from "@/lib/url/extract-metadata";

type GenerateFromInputParams = {
  workspaceId: string;
  input: string;
  outputFormat: MemeOutputFormat;
  templateSlug?: string;
};

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
type TemplateRow = Record<string, unknown>;

function normalizeInput(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Pass-through only: incomplete captions must be rejected in generator validation, not patched here. */
function polishFinalCaption(text: string | null | undefined): string {
  if (text == null) return "";
  return String(text);
}

function hasUsableMetadata(metadata: {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  h1?: string;
}): boolean {
  return Boolean(
    String(metadata.title ?? "").trim() ||
      String(metadata.description ?? "").trim() ||
      String(metadata.ogTitle ?? "").trim() ||
      String(metadata.ogDescription ?? "").trim() ||
      String(metadata.h1 ?? "").trim()
  );
}

function dedupeAdjacentWords(text: string): string {
  const words = text.split(" ").filter(Boolean);
  const out: string[] = [];
  let prev = "";
  for (const word of words) {
    const normalized = word.toLowerCase();
    if (normalized === prev) continue;
    out.push(word);
    prev = normalized;
  }
  return out.join(" ");
}

function cleanMetadataText(text: string): string {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/([!?.,])\1+/g, "$1")
    .replace(/[^\w\s.,'&-]/g, " ")
    .trim();
  const deduped = dedupeAdjacentWords(normalized);
  return deduped.slice(0, 150).trim();
}

function buildSimpleUrlPromptInput(metadata: {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  h1?: string;
}): string {
  const bestRaw =
    String(metadata.description ?? "").trim() ||
    String(metadata.ogDescription ?? "").trim() ||
    String(metadata.title ?? "").trim() ||
    String(metadata.ogTitle ?? "").trim() ||
    String(metadata.h1 ?? "").trim();
  const cleanInput = cleanMetadataText(bestRaw);
  return cleanInput || "A business offering products or services";
}

function assertSupportedOutputFormat(outputFormat: string): asserts outputFormat is MemeOutputFormat {
  if (outputFormat !== "square_image" && outputFormat !== "square_video" && outputFormat !== "square_text") {
    throw new Error(`Unsupported outputFormat "${outputFormat}" for v2.`);
  }
}

async function renderByFormat(params: {
  admin: ReturnType<typeof createWorkspaceAdminClient>;
  template: TemplateRow;
  outputFormat: MemeOutputFormat;
  topText: string;
  bottomText: string | null;
  slot3Text: string | null;
}): Promise<{ mediaBuffer: Buffer; contentType: string; extension: "png" | "mp4" }> {
  const { admin, template, outputFormat, topText, bottomText, slot3Text } = params;
  console.log("TEMPLATE DEBUG - BEFORE RENDER", template);
  const memeTemplatesBucket = process.env.MEME_TEMPLATES_BUCKET ?? "meme-templates";
  const renderTemplate = mapMemeTemplateRowForRender(template);

  if (outputFormat === "square_text") {
    const mediaBuffer = await renderSquareTextMemePng({
      topText,
      bottomText,
      slot1MaxLines:
        typeof template.slot_1_max_lines === "number"
          ? Math.max(1, Math.floor(template.slot_1_max_lines))
          : 8,
      slot2MaxLines:
        typeof template.slot_2_max_lines === "number"
          ? Math.max(0, Math.floor(template.slot_2_max_lines))
          : 4,
      engagementStyle: "classic",
    });
    return { mediaBuffer, contentType: "image/png", extension: "png" };
  }

  if (outputFormat === "square_video") {
    const sourceVideoPath = String(template.source_media_path ?? "").trim();
    if (!sourceVideoPath) {
      throw new Error("Video template missing source_media_path.");
    }
    const { data: baseBlob, error } = await admin.storage
      .from(memeTemplatesBucket)
      .download(sourceVideoPath);
    if (error || !baseBlob) {
      throw new Error(error?.message ?? "Failed to download base video.");
    }
    const baseVideoBuffer = Buffer.from(await baseBlob.arrayBuffer());
    const mediaBuffer = await renderMemeMP4FromTemplate({
      baseVideoBuffer,
      template: renderTemplate,
      topText,
    });
    return { mediaBuffer, contentType: "video/mp4", extension: "mp4" };
  }

  const imageFilename = String(template.image_filename ?? "").trim();
  if (!imageFilename) {
    throw new Error("Image template missing image_filename.");
  }
  const { data: baseBlob, error } = await admin.storage
    .from(memeTemplatesBucket)
    .download(imageFilename);
  if (error || !baseBlob) {
    throw new Error(error?.message ?? "Failed to download base image.");
  }
  const baseImageBuffer = Buffer.from(await baseBlob.arrayBuffer());
  const mediaBuffer = await renderMemePNGFromTemplate({
    baseImageBuffer,
    template: renderTemplate,
    topText,
    bottomText,
    slot_3_text: slot3Text ?? undefined,
  });
  return { mediaBuffer, contentType: "image/png", extension: "png" };
}

export async function generateFromInput(params: GenerateFromInputParams): Promise<{
  finalMediaUrl: string;
  templateSlug: string | null;
  templateName: string | null;
  template: { template_id: string; slug: string | null; template_name: string | null };
  generatedMemeId: string;
  generatedText: string;
  slots: {
    slot_1: string;
    slot_2?: string;
    slot_3?: string;
  };
}> {
  const workspaceId = String(params.workspaceId ?? "").trim();
  const input = normalizeInput(params.input);
  const outputFormat = String(params.outputFormat ?? "").trim();
  const templateSlug = String(params.templateSlug ?? "").trim();
  assertSupportedOutputFormat(outputFormat);

  if (!workspaceId) throw new Error("workspaceId is required.");
  if (!input) throw new Error("input is required.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createWorkspaceAdminClient();
  const { data: templatesRaw, error: templatesError } = await admin
    .from("meme_templates")
    .select("*")
    .eq("is_active", true);

  if (templatesError) throw new Error(templatesError.message);
  const templates = (templatesRaw ?? []) as TemplateRow[];
  const template = pickTemplateSimple(outputFormat, templates, templateSlug || undefined);
  console.log("TEMPLATE DEBUG - SELECTED", template);
  const isUrl = typeof input === "string" && input.startsWith("http");
  let promptInput = input;
  if (isUrl) {
    try {
      const metadata = await extractMetadata(input);
      if (hasUsableMetadata(metadata)) {
        promptInput = buildSimpleUrlPromptInput(metadata);
      } else {
        promptInput = "A business offering products or services";
      }
    } catch (error) {
      console.warn("[v2] URL metadata extraction failed; using MVP fallback", error);
      promptInput = "A business offering products or services";
    }
  }
  const prompt = buildSimplePrompt(promptInput, template, { isPromotionalContext: isUrl });
  const generated = await generateTextFromTemplate(prompt, template);
  const finalTopText = polishFinalCaption(generated.top_text);
  const finalBottomText =
    generated.bottom_text == null ? null : polishFinalCaption(generated.bottom_text);
  const finalSlot3Text =
    generated.slot_3_text == null ? null : polishFinalCaption(generated.slot_3_text);

  const { mediaBuffer, contentType, extension } = await renderByFormat({
    admin,
    template,
    outputFormat,
    topText: finalTopText,
    bottomText: finalBottomText,
    slot3Text: finalSlot3Text,
  });

  const generatedMemeBucket = process.env.MEME_GENERATED_MEMES_BUCKET ?? "generated-memes";
  const templateId = String(template.template_id ?? "").trim();
  if (!templateId) throw new Error("Selected template missing template_id.");

  const objectPath = `generated_memes/${workspaceId}/${templateId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from(generatedMemeBucket)
    .upload(objectPath, mediaBuffer, {
      contentType,
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const publicUrlRes = admin.storage.from(generatedMemeBucket).getPublicUrl(objectPath);
  const finalMediaUrl = publicUrlRes.data.publicUrl ?? "";
  if (!finalMediaUrl) throw new Error("Failed to resolve uploaded media URL.");

  const row = {
    user_id: user?.id ?? null,
    template_id: templateId,
    title: generated.title,
    format: String(template.template_name ?? ""),
    top_text: finalTopText,
    bottom_text: finalBottomText,
    post_caption: null,
    image_url: finalMediaUrl,
    variant_type: "standard",
    generation_run_id: randomUUID(),
    batch_number: 1,
    variant_metadata: {
      workflow_mode: "v2_simple_sync",
      output_format: outputFormat,
      selected_template_id: templateId,
      selected_template_slug: String(template.slug ?? "").trim() || null,
      workspace_id: workspaceId,
    } as Json,
  };

  const { data: inserted, error: insertError } = await admin
    .from("generated_memes")
    .insert(row)
    .select("id")
    .single();
  if (insertError || !inserted?.id) {
    throw new Error(insertError?.message ?? "Failed to insert generated_memes row.");
  }

  return {
    finalMediaUrl,
    templateSlug: String(template.slug ?? "").trim() || null,
    templateName: String(template.template_name ?? "").trim() || null,
    generatedMemeId: String(inserted.id),
    generatedText: finalTopText,
    slots: {
      slot_1: finalTopText,
      ...(finalBottomText ? { slot_2: finalBottomText } : {}),
      ...(finalSlot3Text ? { slot_3: finalSlot3Text } : {}),
    },
    template: {
      template_id: templateId,
      slug: String(template.slug ?? "").trim() || null,
      template_name: String(template.template_name ?? "").trim() || null,
    },
  };
}
