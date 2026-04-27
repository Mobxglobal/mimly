"use server";

import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { isQaTemplatesRouteEnabled } from "@/lib/qa/env";
import { readJsonFile, writeJsonFile } from "@/lib/qa/json-files";
import {
  qaBucketConfigsPath,
  qaRealOutputCachePath,
  qaTemplateBucketsPath,
} from "@/lib/qa/paths";
import { deriveGenerationRoutingForRow } from "@/lib/qa/generation-routing";
import {
  hasCompleteSlot3DefinitionRow,
  hasSlot3Row,
  isActiveTemplateRow,
  isThreeSlotRow,
  isTwoSlotRow,
  getEffectiveSlotMaxCharsRow,
  normalizeTemplateTypeRow,
  toIntRow,
} from "@/lib/qa/template-row-helpers";
import { buildDeterministicCopy, type QaSlotCopy } from "@/lib/qa/test-inputs";
import { compositeSlotBoundingOverlayPng } from "@/lib/qa/slot-overlay";
import { mapMemeTemplateRowForRender } from "@/lib/memes/map-meme-template-row-for-render";
import { generateMockMemes } from "@/lib/actions/memes";
import { isWowDogeTemplateSlug } from "@/lib/memes/wow-doge";
import { renderMemePNGFromTemplate } from "@/renderer/renderMemeTemplate";
import { renderMemeMP4FromTemplate } from "@/renderer/renderMemeVideoTemplate";
import { renderWowDogeMemePng } from "@/renderer/renderWowDogeMeme";
import { renderSquareTextMemePng } from "@/renderer/renderSquareTextMeme";
import { renderEngagementTextMemePng } from "@/renderer/renderEngagementTextMeme";
import type { MemeTemplateForRender } from "@/renderer/renderMemeTemplate";
import type { CompatibleTemplate } from "@/lib/memes/compatible-template";
import {
  HEIGHT_BUCKETS,
  normalizeHeightBucket,
  type HeightBucket,
} from "@/lib/memes/template-types";

const memeTemplatesBucket = process.env.MEME_TEMPLATES_BUCKET ?? "meme-templates";

const QA_CONTEXT =
  "QA template review: indie coffee shop, friendly brand voice, weekday social posts.";

const QA_PROFILE = {
  id: "00000000-0000-4000-8000-00000000feed",
  brand_name: "QA Demo Roasters",
  what_you_do: "Small-batch coffee and pastries for remote workers and students.",
  audience: "Instagram and LinkedIn followers who enjoy light humor",
  country: "US",
  english_variant: "en-US" as const,
};

export type QaRealOutputCacheEntry = {
  top_text: string;
  bottom_text: string | null;
  slot_3_text: string | null;
  phrases?: string[];
  names?: string[];
  title?: string;
};

export type QaRealOutputCacheFile = Record<string, QaRealOutputCacheEntry>;

export type QaBucketConfig = {
  maxFontSize: number;
  minFontSize: number;
  maxLines: number;
  padding: number;
  scaleStrategy: "wrap-first" | "shrink-to-fit";
};

export type QaBucketConfigsFile = Record<string, QaBucketConfig>;

export type QaTemplateBucketsFile = Record<string, string>;

export type QaTemplateListItem = {
  template_id: string;
  slug: string;
  name: string;
  is_active: boolean;
  height_bucket: HeightBucket;
  template_family: string;
  asset_type: "image" | "video";
  image_filename: string | null;
  source_media_path: string | null;
};

type CachedTemplate = QaTemplateListItem & {
  row: Record<string, unknown>;
  templateForRender: MemeTemplateForRender;
  compatibleTemplate: CompatibleTemplate;
  isTwoSlot: boolean;
  isThreeSlot: boolean;
};

const DEFAULT_BUCKETS = ["unreviewed", "good", "needs-work"];

const DEFAULT_BUCKET_CONFIG: QaBucketConfig = {
  maxFontSize: 64,
  minFontSize: 24,
  maxLines: 4,
  padding: 20,
  scaleStrategy: "wrap-first",
};

let templateCache: CachedTemplate[] | null = null;
const assetBufferCache = new Map<string, Buffer>();
const renderDataUrlCache = new Map<string, string>();
const realOutputMemoryCache = new Map<string, QaRealOutputCacheEntry>();

function assertQa(): void {
  if (!isQaTemplatesRouteEnabled()) {
    throw new Error("QA templates tool is disabled.");
  }
}

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase admin configuration.");
  }
  return createSupabaseAdminClient(url, key, { auth: { persistSession: false } });
}

function toNullableInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function stableCopyKey(copy: QaSlotCopy): string {
  return JSON.stringify({
    t: copy.top_text,
    b: copy.bottom_text,
    s: copy.slot_3_text,
    p: copy.wowDogePhrases,
    n: copy.names,
  });
}

function rowToCompatibleTemplate(t: Record<string, unknown>): CompatibleTemplate | null {
  const template_id = String(t.template_id ?? t.id ?? t.slug ?? "").trim();
  const templateType = normalizeTemplateTypeRow(t.text_layout_type ?? t.template_type);
  const slug = String(t.slug ?? "").trim();
  const template_name = String(t.template_name ?? t.name ?? "").trim();
  const slot_1_role = String(t.slot_1_role ?? "").trim();
  if (!template_id || !template_name || !slug || !slot_1_role) return null;

  const isTwoSlot = isTwoSlotRow(t);

  return {
    template_id,
    template_name,
    slug,
    height_bucket: t.height_bucket ? String(t.height_bucket).trim() : null,
    template_family: String(t.template_family ?? "square_meme").trim(),
    text_layout_type: t.text_layout_type ? String(t.text_layout_type).trim() : null,
    template_type: templateType,
    asset_type:
      String(t.asset_type ?? "image").trim().toLowerCase() === "video" ? "video" : "image",
    media_format: t.media_format ? String(t.media_format).trim().toLowerCase() : null,
    template_logic: String(t.template_logic ?? "").trim(),
    meme_mechanic: String(t.meme_mechanic ?? "").trim(),
    emotion_style: String(t.emotion_style ?? "").trim(),
    slot_1_role,
    slot_2_role: t.slot_2_role ? String(t.slot_2_role).trim() : null,
    slot_3_role: t.slot_3_role ? String(t.slot_3_role).trim() : null,
    slot_1_max_chars: getEffectiveSlotMaxCharsRow(templateType, t.slot_1_max_chars, 60),
    slot_2_max_chars: getEffectiveSlotMaxCharsRow(templateType, t.slot_2_max_chars, 60),
    slot_3_max_chars: toIntRow(t.slot_3_max_chars, 60),
    slot_1_max_lines: toIntRow(t.slot_1_max_lines, 2),
    slot_2_max_lines: toIntRow(t.slot_2_max_lines, 2),
    slot_3_max_lines: toIntRow(t.slot_3_max_lines, 2),
    context_fit: String(t.context_fit ?? "").trim(),
    business_fit: String(t.business_fit ?? "").trim(),
    promotion_fit: String(t.promotion_fit ?? "").trim(),
    example_output: String(t.example_output ?? "").trim(),
    isTwoSlot,
    image_filename: t.image_filename ? String(t.image_filename).trim() : null,
    source_media_path: t.source_media_path ? String(t.source_media_path).trim() : null,
    preview_image_filename: t.preview_image_filename
      ? String(t.preview_image_filename).trim()
      : null,
    canvas_width: toNullableInt(t.canvas_width) ?? 1080,
    canvas_height: toNullableInt(t.canvas_height) ?? 1080,
    font: t.font ? String(t.font).trim() : null,
    font_size: toNullableInt(t.font_size),
    alignment: t.alignment ? String(t.alignment).trim() : null,
    text_color: t.text_color ? String(t.text_color).trim() : null,
    stroke_color: t.stroke_color ? String(t.stroke_color).trim() : null,
    stroke_width: toNullableInt(t.stroke_width),
    slot_1_x: toNullableInt(t.slot_1_x),
    slot_1_y: toNullableInt(t.slot_1_y),
    slot_1_width: toNullableInt(t.slot_1_width),
    slot_1_height: toNullableInt(t.slot_1_height),
    slot_2_x: toNullableInt(t.slot_2_x),
    slot_2_y: toNullableInt(t.slot_2_y),
    slot_2_width: toNullableInt(t.slot_2_width),
    slot_2_height: toNullableInt(t.slot_2_height),
    slot_3_x: toNullableInt(t.slot_3_x),
    slot_3_y: toNullableInt(t.slot_3_y),
    slot_3_width: toNullableInt(t.slot_3_width),
    slot_3_height: toNullableInt(t.slot_3_height),
  } satisfies CompatibleTemplate;
}

async function loadCachedTemplates(): Promise<CachedTemplate[]> {
  assertQa();
  if (templateCache) return templateCache;

  const admin = getAdminSupabase();
  const { data: rows, error } = await admin.from("meme_templates").select("*");
  if (error) {
    throw new Error(error.message || "Failed to load meme_templates");
  }

  const list: CachedTemplate[] = [];
  for (const raw of rows ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    const family = String(t.template_family ?? "square_meme").trim();
    if (family === "vertical_slideshow") continue;
    // engagement_text templates are virtual (not stored in meme_templates)
    // and are excluded from QA because they do not support per-template layout tuning.
    if (family === "engagement_text") continue;
    if (hasSlot3Row(t) && !hasCompleteSlot3DefinitionRow(t)) continue;
    if (!deriveGenerationRoutingForRow(t)) continue;

    const compatible = rowToCompatibleTemplate(t);
    if (!compatible) continue;

    const template_id = compatible.template_id;
    const slug = compatible.slug;
    const name = compatible.template_name;
    const asset_type = compatible.asset_type;
    const image_filename = compatible.image_filename;
    const source_media_path = compatible.source_media_path;

    list.push({
      template_id,
      slug,
      name,
      is_active: isActiveTemplateRow(t),
      height_bucket: normalizeHeightBucket(t.height_bucket),
      template_family: family,
      asset_type,
      image_filename,
      source_media_path,
      row: t,
      templateForRender: mapMemeTemplateRowForRender(t),
      compatibleTemplate: compatible,
      isTwoSlot: compatible.isTwoSlot,
      isThreeSlot: isThreeSlotRow(t),
    });
  }

  list.sort((a, b) => a.slug.localeCompare(b.slug));
  templateCache = list;
  return list;
}

async function getAssetBuffer(entry: CachedTemplate): Promise<Buffer> {
  const pathKey =
    entry.asset_type === "video"
      ? `video:${entry.source_media_path ?? ""}`
      : `image:${entry.image_filename ?? ""}`;
  const hit = assetBufferCache.get(pathKey);
  if (hit) return hit;

  const admin = getAdminSupabase();

  if (entry.asset_type === "video") {
    const p = entry.source_media_path ?? "";
    if (!p) throw new Error("Video template missing source_media_path");
    const { data: blob, error } = await admin.storage.from(memeTemplatesBucket).download(p);
    if (error || !blob) throw new Error(error?.message || `Failed to download video: ${p}`);
    const buf = Buffer.from(await (blob as Blob).arrayBuffer());
    assetBufferCache.set(pathKey, buf);
    return buf;
  }

  const p = entry.image_filename ?? "";
  if (!p) throw new Error("Image template missing image_filename");
  const { data: blob, error } = await admin.storage.from(memeTemplatesBucket).download(p);
  if (error || !blob) throw new Error(error?.message || `Failed to download image: ${p}`);
  const buf = Buffer.from(await (blob as Blob).arrayBuffer());
  assetBufferCache.set(pathKey, buf);
  return buf;
}

async function renderWithProductionBranching(
  entry: CachedTemplate,
  copy: QaSlotCopy,
  overlay: boolean
): Promise<{ mime: string; buffer: Buffer }> {
  const template = entry.compatibleTemplate;
  const family = template.template_family;

  let out: Buffer;

  if (family === "square_text") {
    out = await renderSquareTextMemePng({
      topText: copy.top_text,
      bottomText: copy.bottom_text,
      slot1MaxLines: template.slot_1_max_lines,
      slot2MaxLines: template.isTwoSlot ? template.slot_2_max_lines : 0,
    });
    if (overlay) {
      out = await compositeSlotBoundingOverlayPng(out, entry.templateForRender);
    }
    return { mime: "image/png", buffer: out };
  }

  if (family === "engagement_text") {
    out = await renderEngagementTextMemePng({
      keyword: copy.top_text,
      topText: copy.top_text,
      bottomText: copy.bottom_text,
      names: copy.names,
      template: entry.templateForRender,
      engagementStyle: "classic",
    });
    if (overlay) {
      out = await compositeSlotBoundingOverlayPng(out, entry.templateForRender);
    }
    return { mime: "image/png", buffer: out };
  }

  if (template.asset_type === "video") {
    const baseVideoBuffer = await getAssetBuffer(entry);
    out = await renderMemeMP4FromTemplate({
      baseVideoBuffer,
      template,
      topText: copy.top_text,
    });
    // Overlay would require re-encoding video; skip for observation tool.
    return { mime: "video/mp4", buffer: out };
  }

  const baseImageBuffer = await getAssetBuffer(entry);
  const wow =
    isWowDogeTemplateSlug(template.slug) &&
    Array.isArray(copy.wowDogePhrases) &&
    (copy.wowDogePhrases.length === 4 || copy.wowDogePhrases.length === 5);

  out = wow
    ? await renderWowDogeMemePng({
        baseImageBuffer,
        phrases: copy.wowDogePhrases!,
      })
    : await renderMemePNGFromTemplate({
        baseImageBuffer,
        template: entry.templateForRender,
        topText: copy.top_text,
        bottomText: copy.bottom_text,
        slot_3_text: copy.slot_3_text ?? undefined,
      });

  if (overlay) {
    out = await compositeSlotBoundingOverlayPng(out, entry.templateForRender);
  }

  return { mime: "image/png", buffer: out };
}

export async function qaListTemplates(includeDeleted = false): Promise<QaTemplateListItem[]> {
  assertQa();
  const all = await loadCachedTemplates();
  return all
    .filter((x) => (includeDeleted ? true : x.is_active))
    .map((x) => ({
    template_id: x.template_id,
    slug: x.slug,
    name: x.name,
    is_active: x.is_active,
    height_bucket: x.height_bucket,
    template_family: x.template_family,
    asset_type: x.asset_type,
    image_filename: x.image_filename,
    source_media_path: x.source_media_path,
    }));
}

export async function qaGetBootstrap(includeDeleted = false): Promise<{
  templates: QaTemplateListItem[];
  templateBuckets: QaTemplateBucketsFile;
  bucketConfigs: QaBucketConfigsFile;
  bucketNames: string[];
  realOutputKeys: string[];
}> {
  assertQa();
  const templates = await qaListTemplates(includeDeleted);
  const templateBuckets = await readJsonFile<QaTemplateBucketsFile>(qaTemplateBucketsPath(), {});
  const bucketConfigs = await readJsonFile<QaBucketConfigsFile>(qaBucketConfigsPath(), {});
  const cache = await readJsonFile<QaRealOutputCacheFile>(qaRealOutputCachePath(), {});

  const names = new Set<string>([...DEFAULT_BUCKETS, ...Object.keys(bucketConfigs)]);
  for (const v of Object.values(templateBuckets)) {
    const s = String(v ?? "").trim();
    if (s) names.add(s);
  }

  const bucketNames = [...names].sort((a, b) => a.localeCompare(b));

  return {
    templates,
    templateBuckets,
    bucketConfigs,
    bucketNames,
    realOutputKeys: Object.keys(cache),
  };
}

export async function qaGetPreview(params: {
  slug: string;
  mode: "deterministic" | "real";
  overlay: boolean;
}): Promise<{ mime: string; dataUrl: string }> {
  assertQa();
  const all = await loadCachedTemplates();
  const entry = all.find((t) => t.slug === params.slug);
  if (!entry) throw new Error(`Unknown template slug: ${params.slug}`);
  if (!entry.is_active) {
    throw new Error("Template is inactive (deleted bucket). Restore it to preview.");
  }
  if (entry.template_family === "engagement_text") {
    console.warn("[qa-templates] Skipping virtual engagement_text template in preview", {
      slug: entry.slug,
    });
    throw new Error("engagement_text templates are excluded from QA previews.");
  }

  let copy: QaSlotCopy;
  if (params.mode === "deterministic") {
    copy = buildDeterministicCopy({
      slug: entry.slug,
      template_family: entry.template_family,
      isTwoSlot: entry.isTwoSlot,
      isThreeSlot: entry.isThreeSlot,
      templateForRender: entry.templateForRender,
    });
  } else {
    const disk = await readJsonFile<QaRealOutputCacheFile>(qaRealOutputCachePath(), {});
    const fromDisk = disk[entry.slug];
    const fromMem = realOutputMemoryCache.get(entry.slug);
    const merged = fromMem ?? fromDisk;
    if (!merged) {
      throw new Error("No cached real output for this template. Generate first.");
    }
    copy = {
      top_text: merged.top_text,
      bottom_text: merged.bottom_text,
      slot_3_text: merged.slot_3_text,
      ...(merged.phrases && merged.phrases.length > 0 ? { wowDogePhrases: merged.phrases } : {}),
      ...(merged.names && merged.names.length > 0 ? { names: merged.names } : {}),
    };
  }

  const overlayKey = params.overlay && entry.asset_type !== "video" ? "1" : "0";
  const cacheKey = `${entry.slug}|${params.mode}|${overlayKey}|${stableCopyKey(copy)}`;
  const cachedUrl = renderDataUrlCache.get(cacheKey);
  if (cachedUrl) {
    const mime = cachedUrl.startsWith("data:video") ? "video/mp4" : "image/png";
    return { mime, dataUrl: cachedUrl };
  }

  const { mime, buffer } = await renderWithProductionBranching(entry, copy, params.overlay);
  const b64 = buffer.toString("base64");
  const dataUrl = `data:${mime};base64,${b64}`;
  renderDataUrlCache.set(cacheKey, dataUrl);
  return { mime, dataUrl };
}

export async function qaSaveTemplateBucket(slug: string, bucket: string): Promise<void> {
  assertQa();
  const trimmed = String(bucket ?? "").trim();
  if (!trimmed) throw new Error("Bucket name required");

  const path = qaTemplateBucketsPath();
  const data = await readJsonFile<QaTemplateBucketsFile>(path, {});
  data[slug] = trimmed;
  await writeJsonFile(path, data);

  const shouldBeActive = trimmed.toLowerCase() !== "delete";
  const admin = getAdminSupabase();
  const { error: updateError } = await admin
    .from("meme_templates")
    .update({ is_active: shouldBeActive })
    .eq("slug", slug);
  if (updateError) {
    throw new Error(updateError.message || "Failed to sync template active state.");
  }
  await qaInvalidateTemplateListCache();
  revalidatePath("/qa/templates");

  const configsPath = qaBucketConfigsPath();
  const configs = await readJsonFile<QaBucketConfigsFile>(configsPath, {});
  if (!configs[trimmed]) {
    configs[trimmed] = { ...DEFAULT_BUCKET_CONFIG };
    await writeJsonFile(configsPath, configs);
  }
}

export async function qaUpsertBucketConfig(name: string, patch: Partial<QaBucketConfig>): Promise<void> {
  assertQa();
  const trimmed = String(name ?? "").trim();
  if (!trimmed) throw new Error("Bucket name required");
  const configsPath = qaBucketConfigsPath();
  const configs = await readJsonFile<QaBucketConfigsFile>(configsPath, {});
  const prev = configs[trimmed] ?? { ...DEFAULT_BUCKET_CONFIG };
  configs[trimmed] = { ...prev, ...patch };
  await writeJsonFile(configsPath, configs);
}

export async function qaUpdateHeightBucket(
  templateId: string,
  bucket: HeightBucket
): Promise<void> {
  assertQa();
  const id = String(templateId ?? "").trim();
  if (!id) throw new Error("templateId required");
  if (!HEIGHT_BUCKETS.includes(bucket)) {
    throw new Error("Invalid height bucket");
  }

  const admin = getAdminSupabase();
  const { error } = await admin
    .from("meme_templates")
    .update({ height_bucket: bucket })
    .or(`id.eq.${id},template_id.eq.${id},slug.eq.${id}`);
  if (error) {
    throw new Error(error.message || "Failed to update height bucket.");
  }

  await qaInvalidateTemplateListCache();
  revalidatePath("/qa/templates");
}

export async function qaGenerateRealOutput(slug: string): Promise<QaRealOutputCacheEntry> {
  assertQa();
  const all = await loadCachedTemplates();
  const entry = all.find((t) => t.slug === slug);
  if (!entry) throw new Error(`Unknown template slug: ${slug}`);
  if (!entry.is_active) {
    throw new Error("Template is inactive (deleted bucket). Restore it before generation.");
  }
  if (entry.template_family === "engagement_text") {
    console.warn("[qa-templates] Skipping virtual engagement_text template in generation", {
      slug: entry.slug,
    });
    throw new Error("engagement_text templates are excluded from QA generation.");
  }

  const routing = deriveGenerationRoutingForRow(entry.row);
  if (!routing) throw new Error("Template cannot be routed for generation.");

  const gen = await generateMockMemes(QA_CONTEXT, {
    limit: 1,
    forcedTemplateId: slug,
    outputFormat: routing.outputFormat,
    templateFamilyPreference: routing.templateFamilyPreference,
    workspaceContext: {
      allowAnonymousWrite: true,
      actorUserId: null,
      storagePathNamespace: "qa-templates",
      workspaceId: null,
      profileOverride: QA_PROFILE,
    },
    qaCaptureSanitizedTextOnly: true,
  });

  if (gen.error || !gen.qaSanitizedText) {
    throw new Error(gen.error || "Generation did not return QA text payload.");
  }

  const q = gen.qaSanitizedText;
  const wowDogePhrases = (q as { wowDogePhrases?: string[] }).wowDogePhrases;
  const payload: QaRealOutputCacheEntry = {
    top_text: q.top_text,
    bottom_text: q.bottom_text,
    slot_3_text: q.slot_3_text,
    title: q.title,
    ...(q.names && q.names.length > 0 ? { names: q.names } : {}),
    ...(wowDogePhrases && wowDogePhrases.length > 0 ? { phrases: wowDogePhrases } : {}),
  };

  realOutputMemoryCache.set(slug, payload);
  const disk = await readJsonFile<QaRealOutputCacheFile>(qaRealOutputCachePath(), {});
  disk[slug] = payload;
  await writeJsonFile(qaRealOutputCachePath(), disk);

  for (const k of renderDataUrlCache.keys()) {
    if (k.startsWith(`${slug}|real|`)) renderDataUrlCache.delete(k);
  }

  return payload;
}

export async function qaInvalidateTemplateListCache(): Promise<void> {
  templateCache = null;
  assetBufferCache.clear();
  renderDataUrlCache.clear();
  realOutputMemoryCache.clear();
}

export async function qaReadRealOutputCache(slug: string): Promise<QaRealOutputCacheEntry | null> {
  assertQa();
  const mem = realOutputMemoryCache.get(slug);
  if (mem) return mem;
  const disk = await readJsonFile<QaRealOutputCacheFile>(qaRealOutputCachePath(), {});
  return disk[slug] ?? null;
}

export async function deleteTemplatePermanently(
  templateId: string,
  options?: { deleteAssetFromStorage?: boolean }
): Promise<void> {
  assertQa();
  const admin = getAdminSupabase();
  const id = String(templateId ?? "").trim();
  if (!id) throw new Error("templateId required");

  let imageFilename: string | null = null;
  let sourceMediaPath: string | null = null;

  if (options?.deleteAssetFromStorage) {
    const { data: rows } = await admin
      .from("meme_templates")
      .select("image_filename, source_media_path")
      .or(`id.eq.${id},template_id.eq.${id},slug.eq.${id}`)
      .limit(1);
    imageFilename = rows?.[0]?.image_filename ?? null;
    sourceMediaPath = rows?.[0]?.source_media_path ?? null;
  }

  const { error: deleteError } = await admin
    .from("meme_templates")
    .delete()
    .or(`id.eq.${id},template_id.eq.${id},slug.eq.${id}`);
  if (deleteError) {
    throw new Error(deleteError.message || "Failed to delete template row.");
  }

  if (options?.deleteAssetFromStorage) {
    const paths = [imageFilename, sourceMediaPath].filter(
      (p): p is string => typeof p === "string" && p.trim().length > 0
    );
    if (paths.length > 0) {
      await admin.storage.from(memeTemplatesBucket).remove(paths);
    }
  }

  await qaInvalidateTemplateListCache();
}
