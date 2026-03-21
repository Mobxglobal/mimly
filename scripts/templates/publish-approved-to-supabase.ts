import "dotenv/config";

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

/**
 * Image-only usage:
 * pnpm tsx scripts/templates/publish-approved-to-supabase.ts \
 *   --approved="./templates/approved" \
 *   --images="/Users/alexattinger/Desktop/New_templates/top-caption-standard" \
 *   --bucket="meme-templates" \
 *   --storage-prefix="square" \
 *   --dry-run=true
 *
 * Video dry-run usage:
 * pnpm tsx scripts/templates/publish-approved-to-supabase.ts \
 *   --approved="./templates/approved" \
 *   --videos="/Users/alexattinger/Desktop/New_templates/square-video-standard" \
 *   --previews="./templates/previews" \
 *   --bucket="meme-templates" \
 *   --storage-prefix="square" \
 *   --video-storage-prefix="square-video" \
 *   --dry-run=true
 *
 * Video real-run usage:
 * pnpm tsx scripts/templates/publish-approved-to-supabase.ts \
 *   --approved="./templates/approved" \
 *   --videos="/Users/alexattinger/Desktop/New_templates/square-video-standard" \
 *   --previews="./templates/previews" \
 *   --bucket="meme-templates" \
 *   --storage-prefix="square" \
 *   --video-storage-prefix="square-video" \
 *   --dry-run=false
 */

type ApprovedTemplate = {
  template_name?: string;
  name?: string;
  slug: string;
  image_filename?: string;
  is_active: boolean;
  asset_type?: string;
  source_media_filename?: string;
  source_media_path?: string;
  preview_image_filename?: string;
  [key: string]: unknown;
};

type CliOptions = {
  approvedDir: string;
  imagesDir: string | null;
  videosDir: string | null;
  previewsDir: string;
  bucket: string;
  storagePrefix: string;
  videoStoragePrefix: string;
  dryRun: boolean;
  slug: string | null;
  limit: number | null;
  reportPath: string;
};

type ApprovedRecord = {
  approvedPath: string;
  template: ApprovedTemplate;
};

type ReportEntry = {
  slug: string;
  status: "processed" | "skipped" | "failed";
  storageKey: string | null;
  assigned_template_id: number | null;
  template_id_source: "reused" | "new" | null;
  dbPayloadSummary: {
    slug: string;
    template_name: string;
    template_id: number;
    image_filename: string;
    is_active: boolean;
  } | null;
  error: string | null;
};

const DEFAULT_APPROVED_DIR = "./templates/approved";
const DEFAULT_BUCKET = "meme-templates";
const DEFAULT_STORAGE_PREFIX = "square";
const DEFAULT_VIDEO_STORAGE_PREFIX = "square-video";
const DEFAULT_PREVIEWS_DIR = "./templates/previews";
const DEFAULT_REPORT_PATH = "./templates/reports/publish-approved-report.json";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function parseBooleanArg(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseNumberArg(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return Math.floor(parsed);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs(): CliOptions {
  const approvedDir = getArg("approved") ?? DEFAULT_APPROVED_DIR;
  const imagesDir = getArg("images") ?? null;
  const videosDir = getArg("videos") ?? null;
  const previewsDir = getArg("previews") ?? DEFAULT_PREVIEWS_DIR;
  const bucket = getArg("bucket") ?? DEFAULT_BUCKET;
  const storagePrefix = (getArg("storage-prefix") ?? DEFAULT_STORAGE_PREFIX)
    .trim()
    .replace(/^\/+|\/+$/g, "");
  const videoStoragePrefix = (getArg("video-storage-prefix") ?? DEFAULT_VIDEO_STORAGE_PREFIX)
    .trim()
    .replace(/^\/+|\/+$/g, "");
  const dryRun = parseBooleanArg(getArg("dry-run"), false);
  const slug = (getArg("slug") ?? "").trim() || null;
  const limit = parseNumberArg(getArg("limit"));
  const reportPath = getArg("report") ?? DEFAULT_REPORT_PATH;

  return {
    approvedDir,
    imagesDir,
    videosDir,
    previewsDir,
    bucket,
    storagePrefix,
    videoStoragePrefix,
    dryRun,
    slug,
    limit,
    reportPath,
  };
}

function safeJsonParse(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function isApprovedTemplate(value: unknown): value is ApprovedTemplate {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ApprovedTemplate>;
  return (
    typeof record.slug === "string" &&
    (typeof record.template_name === "string" || typeof record.name === "string")
  );
}

function loadApprovedRecords(options: CliOptions): {
  records: ApprovedRecord[];
  skippedEntries: ReportEntry[];
} {
  const approvedFiles = fs
    .readdirSync(options.approvedDir)
    .filter((file) => file.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const records: ApprovedRecord[] = [];
  const skippedEntries: ReportEntry[] = [];

  for (const file of approvedFiles) {
    const approvedPath = path.join(options.approvedDir, file);
    const raw = fs.readFileSync(approvedPath, "utf8");
    const parsed = safeJsonParse(raw);

    if (!isApprovedTemplate(parsed)) {
      skippedEntries.push({
        slug: path.parse(file).name,
        status: "skipped",
        storageKey: null,
        assigned_template_id: null,
        template_id_source: null,
        dbPayloadSummary: null,
        error: "Invalid approved JSON shape",
      });
      continue;
    }

    if (options.slug && parsed.slug !== options.slug) {
      continue;
    }

    records.push({ approvedPath, template: parsed });
  }

  return {
    records: options.limit != null ? records.slice(0, options.limit) : records,
    skippedEntries,
  };
}

function findImagePath(imagesDir: string, template: ApprovedTemplate): string | null {
  if (!template.image_filename) return null;
  const exactPath = path.join(imagesDir, template.image_filename);
  if (fs.existsSync(exactPath)) {
    return exactPath;
  }

  const slugPngPath = path.join(imagesDir, `${template.slug}.png`);
  if (fs.existsSync(slugPngPath)) {
    return slugPngPath;
  }

  const normalizedFilename = template.image_filename.trim().toLowerCase();
  const normalizedSlugPng = `${template.slug}.png`.toLowerCase();
  const allFiles = fs.readdirSync(imagesDir);
  const caseInsensitiveMatch = allFiles.find((file) => {
    const normalized = file.trim().toLowerCase();
    return normalized === normalizedFilename || normalized === normalizedSlugPng;
  });

  return caseInsensitiveMatch ? path.join(imagesDir, caseInsensitiveMatch) : null;
}

function buildStorageKey(storagePrefix: string, slug: string): string {
  return `${storagePrefix}/${slug}.png`;
}

function buildVideoStorageKey(videoStoragePrefix: string, slug: string): string {
  return `${videoStoragePrefix}/${slug}.mp4`;
}

function buildVideoPreviewStorageKey(
  videoStoragePrefix: string,
  slug: string,
  previewFilename: string
): string {
  const ext = path.extname(previewFilename).toLowerCase() || ".png";
  return `${videoStoragePrefix}/${slug}-preview${ext}`;
}

function findVideoPath(options: CliOptions, template: ApprovedTemplate): string | null {
  const directPath = (template.source_media_path ?? "").trim();
  if (directPath && fs.existsSync(path.resolve(directPath))) {
    return path.resolve(directPath);
  }

  const sourceFilename = (template.source_media_filename ?? "").trim();
  if (!sourceFilename || !options.videosDir) {
    return null;
  }

  const fromVideosDir = path.resolve(options.videosDir, sourceFilename);
  if (fs.existsSync(fromVideosDir)) {
    return fromVideosDir;
  }

  const slugMp4Path = path.resolve(options.videosDir, `${template.slug}.mp4`);
  if (fs.existsSync(slugMp4Path)) {
    return slugMp4Path;
  }

  return null;
}

function findPreviewPath(previewsDir: string, template: ApprovedTemplate): string | null {
  const previewFilename = (template.preview_image_filename ?? "").trim();
  if (!previewFilename) return null;

  const exactPath = path.resolve(previewsDir, previewFilename);
  if (fs.existsSync(exactPath)) {
    return exactPath;
  }
  return null;
}

function getContentTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  return "application/octet-stream";
}

function buildDbPayload(
  template: ApprovedTemplate,
  storageKey: string | null,
  previewStorageKey: string | null,
  templateId: number
): Record<string, unknown> {
  const { id: _ignoredId, ...rest } = template as ApprovedTemplate & { id?: unknown };
  const normalizedTemplateName = String(
    template.template_name ?? template.name ?? ""
  ).trim();
  const isVideoTemplate = String(template.asset_type ?? "").trim().toLowerCase() === "video";

  if (isVideoTemplate) {
    return {
      template_id: templateId,
      template_name: normalizedTemplateName,
      slug: String(template.slug ?? "").trim(),
      asset_type: "video",
      media_format: String(template.media_format ?? "mp4").trim().toLowerCase() || "mp4",
      text_layout_type: String(template.template_type ?? "").trim(),
      canvas_width: template.canvas_width ?? null,
      canvas_height: template.canvas_height ?? null,
      slot_1_x: template.slot_1_x ?? null,
      slot_1_y: template.slot_1_y ?? null,
      slot_1_width: template.slot_1_width ?? null,
      slot_1_height: template.slot_1_height ?? null,
      slot_1_max_chars: template.slot_1_max_chars ?? null,
      slot_1_max_lines: template.slot_1_max_lines ?? null,
      font: template.font ?? null,
      font_size: template.font_size ?? null,
      alignment: template.alignment ?? null,
      text_color: template.text_color ?? null,
      stroke_color: template.stroke_color ?? null,
      stroke_width: template.stroke_width ?? null,
      content_region_x: template.content_region_x ?? null,
      content_region_y: template.content_region_y ?? null,
      content_region_width: template.content_region_width ?? null,
      content_region_height: template.content_region_height ?? null,
      source_media_filename: String(
        template.source_media_filename ?? `${template.slug}.mp4`
      ).trim(),
      source_media_path: storageKey,
      image_filename: String(previewStorageKey ?? "").trim(),
      preview_image_filename: String(previewStorageKey ?? "").trim(),
      pattern_type: template.pattern_type ?? null,
      meme_mechanic: template.meme_mechanic ?? null,
      template_logic: template.template_logic ?? null,
      emotion_style: template.emotion_style ?? null,
      slot_1_role: template.slot_1_role ?? null,
      example_output: template.example_output ?? null,
      is_active: false,
    };
  }

  const resolvedImageFilename =
    storageKey ?? String(template.image_filename ?? previewStorageKey ?? "").trim();

  return {
    ...rest,
    template_name: normalizedTemplateName,
    template_id: templateId,
    image_filename: resolvedImageFilename,
    source_media_filename: isVideoTemplate
      ? String(template.source_media_filename ?? `${template.slug}.mp4`).trim()
      : rest.source_media_filename,
    source_media_path: isVideoTemplate ? storageKey : rest.source_media_path,
    preview_image_filename: isVideoTemplate
      ? String(previewStorageKey ?? template.preview_image_filename ?? "").trim()
      : rest.preview_image_filename,
    is_active: false,
  };
}

function buildPayloadSummary(payload: Record<string, unknown>) {
  return {
    slug: String(payload.slug ?? ""),
    template_name: String(payload.template_name ?? ""),
    template_id: Number(payload.template_id ?? 0),
    image_filename: String(payload.image_filename ?? ""),
    source_media_path: String(payload.source_media_path ?? ""),
    preview_image_filename: String(payload.preview_image_filename ?? ""),
    asset_type: String(payload.asset_type ?? "image"),
    media_format: String(payload.media_format ?? ""),
    is_active: Boolean(payload.is_active),
  };
}

async function fetchExistingTemplateIdMap(params: {
  supabase: ReturnType<typeof createClient>;
}): Promise<Map<string, number>> {
  const { supabase } = params;
  const { data, error } = await supabase
    .from("meme_templates")
    .select("slug, template_id")
    .not("slug", "is", null);

  if (error) {
    throw new Error(`Failed to load existing template slugs: ${error.message}`);
  }

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const slug = String((row as any).slug ?? "").trim();
    const templateId = Number((row as any).template_id);
    if (!slug || !Number.isFinite(templateId)) continue;
    map.set(slug, Math.floor(templateId));
  }
  return map;
}

async function fetchNextTemplateIdSeed(params: {
  supabase: ReturnType<typeof createClient>;
}): Promise<number> {
  const { supabase } = params;
  const { data, error } = await supabase
    .from("meme_templates")
    .select("template_id")
    .not("template_id", "is", null)
    .order("template_id", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch max template_id: ${error.message}`);
  }

  const maxId = Number((data?.[0] as any)?.template_id ?? 0);
  if (!Number.isFinite(maxId) || maxId < 1) return 1;
  return Math.floor(maxId) + 1;
}

function resolveTemplateId(params: {
  slug: string;
  existingIdBySlug: Map<string, number>;
  nextTemplateIdRef: { current: number };
}): { templateId: number; source: "reused" | "new" } {
  const { slug, existingIdBySlug, nextTemplateIdRef } = params;
  const existing = existingIdBySlug.get(slug);
  if (existing != null) {
    return { templateId: existing, source: "reused" };
  }

  const assigned = nextTemplateIdRef.current;
  nextTemplateIdRef.current += 1;
  existingIdBySlug.set(slug, assigned);
  return { templateId: assigned, source: "new" };
}

async function uploadImage(params: {
  supabase: ReturnType<typeof createClient>;
  bucket: string;
  storageKey: string;
  filePath: string;
}): Promise<void> {
  const { supabase, bucket, storageKey, filePath } = params;
  const fileBuffer = fs.readFileSync(filePath);

  const { error } = await supabase.storage.from(bucket).upload(storageKey, fileBuffer, {
    contentType: getContentTypeForFile(filePath),
    upsert: true,
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

async function upsertTemplate(params: {
  supabase: ReturnType<typeof createClient>;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { supabase, payload } = params;

  const { error } = await supabase.from("meme_templates").upsert(payload, {
    onConflict: "slug",
  });

  if (error) {
    throw new Error(`meme_templates upsert failed: ${error.message}`);
  }
}

function writeReport(reportPath: string, entries: ReportEntry[]): void {
  ensureDir(path.dirname(reportPath));
  fs.writeFileSync(reportPath, JSON.stringify(entries, null, 2), "utf8");
}

async function main(): Promise<void> {
  const options = parseArgs();
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  if (!fs.existsSync(options.approvedDir)) {
    throw new Error(`Approved directory does not exist: ${options.approvedDir}`);
  }

  if (options.imagesDir && !fs.existsSync(options.imagesDir)) {
    throw new Error(`Images directory does not exist: ${options.imagesDir}`);
  }
  if (options.videosDir && !fs.existsSync(options.videosDir)) {
    throw new Error(`Videos directory does not exist: ${options.videosDir}`);
  }
  if (!fs.existsSync(options.previewsDir)) {
    throw new Error(`Previews directory does not exist: ${options.previewsDir}`);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const existingIdBySlug = await fetchExistingTemplateIdMap({ supabase });
  const nextTemplateIdRef = {
    current: await fetchNextTemplateIdSeed({ supabase }),
  };

  const { records, skippedEntries } = loadApprovedRecords(options);
  const reportEntries: ReportEntry[] = [...skippedEntries];

  let processed = 0;
  let imageProcessed = 0;
  let videoProcessed = 0;
  let uploadsPlanned = 0;
  let uploaded = 0;
  let upserted = 0;
  let skipped = skippedEntries.length;
  let failed = 0;

  console.log(`Approved folder: ${options.approvedDir}`);
  console.log(`Images folder: ${options.imagesDir ?? "(not set)"}`);
  console.log(`Videos folder: ${options.videosDir ?? "(not set)"}`);
  console.log(`Previews folder: ${options.previewsDir}`);
  console.log(`Bucket: ${options.bucket}`);
  console.log(`Storage prefix: ${options.storagePrefix}`);
  console.log(`Video storage prefix: ${options.videoStoragePrefix}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Approved JSON files found: ${records.length + skippedEntries.length}`);

  for (const record of records) {
    const { template } = record;
    const isVideoTemplate =
      String(template.asset_type ?? "image").trim().toLowerCase() === "video";
    const imagePath =
      !isVideoTemplate && options.imagesDir
        ? findImagePath(options.imagesDir, template)
        : null;
    const videoPath = isVideoTemplate ? findVideoPath(options, template) : null;
    const previewPath = isVideoTemplate
      ? findPreviewPath(options.previewsDir, template)
      : null;

    if (!isVideoTemplate && !options.imagesDir) {
      skipped++;
      reportEntries.push({
        slug: template.slug,
        status: "skipped",
        storageKey: null,
        assigned_template_id: null,
        template_id_source: null,
        dbPayloadSummary: null,
        error: "Missing --images argument for image template publishing",
      });
      console.log(`skipped: ${template.slug} (missing --images for image draft)`);
      continue;
    }

    if (!isVideoTemplate && !imagePath) {
      skipped++;
      reportEntries.push({
        slug: template.slug,
        status: "skipped",
        storageKey: null,
        assigned_template_id: null,
        template_id_source: null,
        dbPayloadSummary: null,
        error: `Missing image for ${template.image_filename}`,
      });
      console.log(`skipped: ${template.slug} (missing image)`);
      continue;
    }

    if (isVideoTemplate && !videoPath) {
      skipped++;
      reportEntries.push({
        slug: template.slug,
        status: "skipped",
        storageKey: null,
        assigned_template_id: null,
        template_id_source: null,
        dbPayloadSummary: null,
        error: "Missing source video (source_media_path/source_media_filename not resolvable)",
      });
      console.log(`skipped: ${template.slug} (missing source video)`);
      continue;
    }

    if (isVideoTemplate && !previewPath) {
      skipped++;
      reportEntries.push({
        slug: template.slug,
        status: "skipped",
        storageKey: null,
        assigned_template_id: null,
        template_id_source: null,
        dbPayloadSummary: null,
        error: "Missing preview image for video draft",
      });
      console.log(`skipped: ${template.slug} (missing preview image)`);
      continue;
    }

    processed++;
    if (isVideoTemplate) {
      videoProcessed++;
    } else {
      imageProcessed++;
    }

    const storageKey = isVideoTemplate
      ? buildVideoStorageKey(options.videoStoragePrefix, template.slug)
      : buildStorageKey(options.storagePrefix, template.slug);
    const previewStorageKey = isVideoTemplate && previewPath
      ? buildVideoPreviewStorageKey(
          options.videoStoragePrefix,
          template.slug,
          path.basename(previewPath)
        )
      : null;

    if (isVideoTemplate) {
      uploadsPlanned += 2;
    } else {
      uploadsPlanned += 1;
    }

    const { templateId, source } = resolveTemplateId({
      slug: template.slug,
      existingIdBySlug,
      nextTemplateIdRef,
    });
    const payload = buildDbPayload(template, storageKey, previewStorageKey, templateId);
    const payloadSummary = buildPayloadSummary(payload);

    try {
      if (options.dryRun) {
        console.log(`processed: ${template.slug}`);
        console.log(`  asset_type: ${isVideoTemplate ? "video" : "image"}`);
        console.log(`  storage_key: ${storageKey}`);
        if (previewStorageKey) {
          console.log(`  preview_storage_key: ${previewStorageKey}`);
        }
        console.log(`  assigned_template_id: ${templateId} (${source})`);
        console.log(`  db_payload: ${JSON.stringify(payloadSummary)}`);
      } else {
        if (isVideoTemplate && videoPath && previewPath) {
          await uploadImage({
            supabase,
            bucket: options.bucket,
            storageKey,
            filePath: videoPath,
          });
          uploaded++;

          await uploadImage({
            supabase,
            bucket: options.bucket,
            storageKey: previewStorageKey as string,
            filePath: previewPath,
          });
          uploaded++;
        } else {
          await uploadImage({
            supabase,
            bucket: options.bucket,
            storageKey,
            filePath: imagePath as string,
          });
          uploaded++;
        }

        if (isVideoTemplate) {
          console.log("video db payload keys", Object.keys(payload));
          console.log("video db payload", JSON.stringify(payload, null, 2));
          const { data, error } = await supabase.from("meme_templates").upsert(payload, {
            onConflict: "slug",
          });
          console.log("video db upsert result data", data);
          console.log("video db upsert result error", error);
          if (error) {
            console.error("video db upsert full error", JSON.stringify(error, null, 2));
            throw new Error(`meme_templates upsert failed: ${error.message}`);
          }
        } else {
          await upsertTemplate({
            supabase,
            payload,
          });
        }
        upserted++;

        console.log(`processed: ${template.slug}`);
      }

      reportEntries.push({
        slug: template.slug,
        status: "processed",
        storageKey,
        assigned_template_id: templateId,
        template_id_source: source,
        dbPayloadSummary: payloadSummary,
        error: null,
      });
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : "unknown error";
      reportEntries.push({
        slug: template.slug,
        status: "failed",
        storageKey,
        assigned_template_id: templateId,
        template_id_source: source,
        dbPayloadSummary: payloadSummary,
        error: message,
      });
      console.log(`failed: ${template.slug} (${message})`);
    }
  }

  writeReport(options.reportPath, reportEntries);

  console.log("\nSummary");
  console.log(`Approved JSON files found: ${records.length + skippedEntries.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Image templates processed: ${imageProcessed}`);
  console.log(`Video templates processed: ${videoProcessed}`);
  console.log(`Storage uploads planned: ${uploadsPlanned}`);
  console.log(`Storage uploads completed: ${uploaded}`);
  console.log(`DB rows planned: ${processed}`);
  console.log(`Upserted: ${upserted}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Report written: ${options.reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
