/**
 * Bulk-ingest vertical slideshow background images from a local folder into Supabase.
 *
 * Usage (default dir is ~/Desktop/New_templates/tt-slideshow):
 *   pnpm exec tsx scripts/slideshow/ingest-tt-slideshow.ts --dry-run=false
 *   pnpm exec tsx scripts/slideshow/ingest-tt-slideshow.ts --dir="/custom/path" --dry-run=false
 *
 * Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 * Optional: SLIDESHOW_INGEST_DIR (overrides default source folder)
 * Optional: SLIDESHOW_ASSETS_BUCKET (default slideshow-assets), SLIDESHOW_STORAGE_PREFIX (default vertical)
 * Optional: --limit=N, --report=./path/to/report.json
 * Optional: --vision-delay-ms=N (or SLIDESHOW_VISION_DELAY_MS) — pause between vision calls to reduce 429s
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { normalizeSlideshowAssetVisionMetadata } from "@/lib/memes/slideshow/slideshow-asset-metadata";
import type { SlideshowAssetVisionMetadata } from "@/lib/memes/slideshow/types";

const SUPPORTED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function parseBool(v: string | undefined, d: boolean): boolean {
  if (v == null || v === "") return d;
  const x = v.trim().toLowerCase();
  if (x === "true") return true;
  if (x === "false") return false;
  throw new Error(`Invalid boolean: ${v}`);
}

function parseLimit(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.trim());
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Invalid limit: ${v}`);
  }
  return Math.floor(n);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse "Please try again in 344ms" from OpenAI 429 JSON body. */
function parseRetryAfterMsFromOpenAiBody(bodyText: string): number | null {
  const msMatch = bodyText.match(/try again in (\d+(?:\.\d+)?)\s*ms/i);
  if (msMatch) {
    const n = Number(msMatch[1]);
    if (Number.isFinite(n)) return Math.ceil(n) + 200;
  }
  const sMatch = bodyText.match(/try again in (\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?\b/i);
  if (sMatch) {
    const n = Number(sMatch[1]);
    if (Number.isFinite(n)) return Math.ceil(n * 1000) + 200;
  }
  return null;
}

function parseVisionDelayMs(v: string | undefined): number {
  if (v == null || v.trim() === "") return 0;
  const n = Number(v.trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid vision-delay-ms: ${v}`);
  }
  return Math.min(Math.floor(n), 120_000);
}

/** Same recovery pattern as scripts/templates/enrich-drafts-with-llm.ts */
function safeJsonParse(s: string): unknown {
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Default: `~/Desktop/New_templates/tt-slideshow` (macOS/Linux) or equivalent on Windows.
 * Override with `--dir=` or `SLIDESHOW_INGEST_DIR`.
 */
function defaultSlideshowSourceFolder(): string {
  const envDir = process.env.SLIDESHOW_INGEST_DIR?.trim();
  if (envDir) {
    return path.resolve(envDir);
  }
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(home, "Desktop", "New_templates", "tt-slideshow");
}

function getContentTypeForExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  return "application/octet-stream";
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function discoverImageFiles(dir: string): string[] {
  const names = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const ent of names) {
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!SUPPORTED_EXT.has(ext)) continue;
    files.push(ent.name);
  }
  return files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

type ReportEntry = {
  file: string;
  status: "ok" | "skipped_duplicate" | "failed_vision" | "failed_upload" | "failed_db" | "dry_run";
  content_hash?: string;
  storage_path?: string;
  public_url?: string | null;
  error?: string | null;
  metadata?: Pick<
    SlideshowAssetVisionMetadata,
    | "theme"
    | "mood"
    | "setting"
    | "subject_type"
    | "industry_tags"
    | "color_profile"
    | "text_overlay_suitability"
    | "layout_a_fit"
    | "layout_b_fit"
    | "summary"
    | "notes"
  >;
};

function buildRow(params: {
  hash: string;
  storagePath: string;
  publicUrl: string | null;
  meta: SlideshowAssetVisionMetadata;
  metaRaw: Record<string, unknown>;
}): Record<string, unknown> {
  const { hash, storagePath, publicUrl, meta, metaRaw } = params;
  return {
    content_hash: hash,
    storage_path: storagePath,
    public_url: publicUrl && publicUrl.trim() ? publicUrl.trim() : null,
    theme: meta.theme,
    mood: meta.mood,
    setting: meta.setting,
    subject_type: meta.subject_type,
    industry_tags: meta.industry_tags.length ? meta.industry_tags : [],
    color_profile: meta.color_profile,
    text_overlay_suitability: meta.text_overlay_suitability,
    layout_a_fit: meta.layout_a_fit,
    layout_b_fit: meta.layout_b_fit,
    summary: meta.summary.trim() ? meta.summary.trim().slice(0, 200) : null,
    notes: meta.notes.trim() ? meta.notes.trim().slice(0, 160) : null,
    raw_metadata: metaRaw as unknown as Record<string, unknown>,
  };
}

async function visionMetadataForImage(params: {
  apiKey: string;
  base64Jpeg: string;
  maxRetries?: number;
}): Promise<Record<string, unknown>> {
  const prompt = `Analyze this vertical photo as a slideshow background (dark text will be overlaid). Output practical metadata for deterministic matching — not poetic language.

Return ONLY a JSON object with exactly these keys:
- theme: MUST be exactly one of: comfort, discomfort, luxury, productivity, cleanliness, stress, relief, lifestyle
- mood: MUST be exactly one of: calm, warm, cool, serious, aspirational, frustrated
- setting: MUST be exactly one of: home_interior, home_exterior, office, outdoor_urban, commercial_interior
- subject_type: MUST be exactly one of: environment, person, product, detail
- industry_tags: array of 0-6 short snake_case strings (e.g. saas, retail, fitness) — no spaces
- color_profile: MUST be exactly one of: warm, cool, neutral, high_contrast, muted, monochrome
- text_overlay_suitability: MUST be exactly one of: high, medium, low (readability for bold white text on dark overlay)
- layout_a_fit: integer 0-10 (short headline in upper third)
- layout_b_fit: integer 0-10 (supporting line in vertical center / middle band)
- summary: one plain factual sentence, max 160 characters, no metaphors or marketing fluff
- notes: optional, max 120 characters, technical only if needed; use empty string if none

Do not invent new labels outside the lists above. Use the closest allowed value if uncertain.`;

  const requestBody = JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a strict metadata tagger. Output a single JSON object only. Every enum field must use one of the exact allowed strings from the user message — no synonyms, no extra words. No markdown.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${params.base64Jpeg}`,
            },
          },
        ],
      },
    ],
  });

  const maxRetries = Math.max(1, Math.floor(params.maxRetries ?? 8));

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: requestBody,
    });

    const bodyText = await res.text();

    if (res.ok) {
      let json: { choices?: { message?: { content?: string } }[] };
      try {
        json = JSON.parse(bodyText) as {
          choices?: { message?: { content?: string } }[];
        };
      } catch {
        throw new Error("Vision response was not valid JSON");
      }
      const content = json?.choices?.[0]?.message?.content ?? "";
      const parsed = safeJsonParse(String(content));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Vision response was not a JSON object");
      }
      return parsed as Record<string, unknown>;
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < maxRetries - 1) {
      const headerWait = res.headers.get("retry-after");
      let waitMs =
        headerWait != null && /^\d+$/.test(headerWait.trim())
          ? Number(headerWait.trim()) * 1000
          : null;
      if (waitMs == null || !Number.isFinite(waitMs)) {
        waitMs = parseRetryAfterMsFromOpenAiBody(bodyText);
      }
      if (waitMs == null || !Number.isFinite(waitMs)) {
        waitMs = Math.min(120_000, 2000 * 2 ** attempt);
      }
      waitMs = Math.max(500, Math.min(120_000, waitMs));
      console.warn(
        `[vision] OpenAI ${res.status}, waiting ${waitMs}ms before retry ${attempt + 2}/${maxRetries}`
      );
      await sleep(waitMs);
      continue;
    }

    throw new Error(`OpenAI error ${res.status}: ${bodyText}`);
  }

  throw new Error("OpenAI vision: exhausted retries");
}

async function main(): Promise<void> {
  const dir = path.resolve(getArg("dir")?.trim() || defaultSlideshowSourceFolder());
  const dryRun = parseBool(getArg("dry-run"), false);
  const bucket = getArg("bucket")?.trim() || process.env.SLIDESHOW_ASSETS_BUCKET || "slideshow-assets";
  const storagePrefix = (getArg("storage-prefix")?.trim() || process.env.SLIDESHOW_STORAGE_PREFIX || "vertical")
    .replace(/^\/+|\/+$/g, "");
  const limit = parseLimit(getArg("limit"));
  const reportPath = getArg("report")?.trim() || null;
  const visionDelayMs = parseVisionDelayMs(
    getArg("vision-delay-ms")?.trim() || process.env.SLIDESHOW_VISION_DELAY_MS?.trim()
  );

  const supabaseUrl =
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();

  const envErrors: string[] = [];
  if (!supabaseUrl) {
    envErrors.push("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!serviceKey) {
    envErrors.push("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!apiKey) {
    envErrors.push("Missing OPENAI_API_KEY");
  }
  if (envErrors.length) {
    throw new Error(`Environment validation failed:\n- ${envErrors.join("\n- ")}`);
  }

  if (!fs.existsSync(dir)) {
    throw new Error(`Folder not found: ${dir}`);
  }
  if (!fs.statSync(dir).isDirectory()) {
    throw new Error(`Path is not a directory: ${dir}`);
  }

  let allFiles = discoverImageFiles(dir);
  const discoveredTotal = allFiles.length;
  if (limit != null) {
    allFiles = allFiles.slice(0, limit);
  }

  console.log("[ingest-slideshow] startup");
  console.log(`  target_folder: ${dir}`);
  console.log(`  bucket: ${bucket}`);
  console.log(`  storage_prefix: ${storagePrefix}`);
  console.log(`  dry_run: ${dryRun}`);
  console.log(`  files_discovered: ${discoveredTotal}`);
  if (limit != null) {
    console.log(`  limit: ${limit} (processing ${allFiles.length} file(s))`);
  } else {
    console.log(`  processing: ${allFiles.length} file(s)`);
  }
  if (reportPath) {
    console.log(`  report: ${path.resolve(reportPath)}`);
  }
  if (visionDelayMs > 0) {
    console.log(`  vision_delay_ms: ${visionDelayMs}`);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const reportEntries: ReportEntry[] = [];
  let skippedDuplicate = 0;
  let failedVision = 0;
  let failedUpload = 0;
  let failedDb = 0;
  let uploaded = 0;
  let upserted = 0;
  let dryRunProcessed = 0;
  let completedVisionCalls = 0;

  for (const file of allFiles) {
    const full = path.join(dir, file);
    const buf = fs.readFileSync(full);
    const hash = createHash("sha256").update(buf).digest("hex");
    const ext = path.extname(file).toLowerCase() || ".jpg";
    const storagePath = `${storagePrefix}/${hash}${ext}`;
    const contentType = getContentTypeForExt(ext);

    const { data: existing, error: existingErr } = await supabase
      .from("slideshow_image_assets")
      .select("id, content_hash")
      .eq("content_hash", hash)
      .maybeSingle();

    if (existingErr) {
      console.error(`[fail] ${file} — duplicate lookup failed: ${existingErr.message}`);
      reportEntries.push({
        file,
        status: "failed_db",
        content_hash: hash,
        storage_path: storagePath,
        error: `duplicate lookup: ${existingErr.message}`,
      });
      failedDb++;
      continue;
    }

    if (existing) {
      console.log(`[skip] duplicate content_hash=${hash.slice(0, 12)}… file=${file}`);
      skippedDuplicate++;
      reportEntries.push({
        file,
        status: "skipped_duplicate",
        content_hash: hash,
        storage_path: storagePath,
      });
      continue;
    }

    let metaRaw: Record<string, unknown>;
    try {
      if (visionDelayMs > 0 && completedVisionCalls > 0) {
        await sleep(visionDelayMs);
      }
      const jpegBuf = await sharp(buf)
        .rotate()
        .resize(1024, 1536, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      const b64 = jpegBuf.toString("base64");
      metaRaw = await visionMetadataForImage({ apiKey, base64Jpeg: b64 });
      completedVisionCalls++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[fail] ${file} — vision: ${msg}`);
      failedVision++;
      reportEntries.push({
        file,
        status: "failed_vision",
        content_hash: hash,
        storage_path: storagePath,
        error: msg,
      });
      continue;
    }

    const meta = normalizeSlideshowAssetVisionMetadata(metaRaw);
    const metadataReport: ReportEntry["metadata"] = {
      theme: meta.theme,
      mood: meta.mood,
      setting: meta.setting,
      subject_type: meta.subject_type,
      industry_tags: meta.industry_tags,
      color_profile: meta.color_profile,
      text_overlay_suitability: meta.text_overlay_suitability,
      layout_a_fit: meta.layout_a_fit,
      layout_b_fit: meta.layout_b_fit,
      summary: meta.summary,
      notes: meta.notes,
    };

    if (dryRun) {
      console.log(
        `[dry-run] ${file} -> ${storagePath} theme=${meta.theme} mood=${meta.mood} setting=${meta.setting}`
      );
      dryRunProcessed++;
      reportEntries.push({
        file,
        status: "dry_run",
        content_hash: hash,
        storage_path: storagePath,
        metadata: metadataReport,
      });
      continue;
    }

    const { error: upErr } = await supabase.storage.from(bucket).upload(storagePath, buf, {
      contentType,
      upsert: true,
    });
    if (upErr) {
      console.error(`[fail] ${file} — upload: ${upErr.message}`);
      failedUpload++;
      reportEntries.push({
        file,
        status: "failed_upload",
        content_hash: hash,
        storage_path: storagePath,
        error: upErr.message,
        metadata: metadataReport,
      });
      continue;
    }
    uploaded++;

    const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    const publicUrl = (pubData?.publicUrl ?? "").trim() || null;
    if (!publicUrl) {
      console.warn(
        `[warn] ${file} — getPublicUrl returned empty string (check bucket is public or use signed URLs in app)`
      );
    }

    const row = buildRow({
      hash,
      storagePath,
      publicUrl,
      meta,
      metaRaw,
    });

    const { error: dbErr } = await supabase.from("slideshow_image_assets").upsert(row, {
      onConflict: "content_hash",
    });

    if (dbErr) {
      console.error(`[fail] ${file} — db: ${dbErr.message}`);
      failedDb++;
      reportEntries.push({
        file,
        status: "failed_db",
        content_hash: hash,
        storage_path: storagePath,
        public_url: publicUrl,
        error: dbErr.message,
        metadata: metadataReport,
      });
      continue;
    }

    upserted++;
    console.log(
      `[ok] ${file} -> ${storagePath} public_url=${publicUrl ? "yes" : "no"} theme=${meta.theme}`
    );
    reportEntries.push({
      file,
      status: "ok",
      content_hash: hash,
      storage_path: storagePath,
      public_url: publicUrl,
      metadata: metadataReport,
    });
  }

  console.log("\n[ingest-slideshow] summary");
  console.log(`  files_discovered: ${discoveredTotal}`);
  console.log(`  files_in_batch: ${allFiles.length}`);
  console.log(`  skipped_duplicate: ${skippedDuplicate}`);
  console.log(`  failed_vision: ${failedVision}`);
  console.log(`  failed_upload: ${failedUpload}`);
  console.log(`  failed_db: ${failedDb}`);
  if (dryRun) {
    console.log(`  dry_run_simulated: ${dryRunProcessed}`);
  } else {
    console.log(`  storage_uploads: ${uploaded}`);
    console.log(`  db_upserts: ${upserted}`);
  }

  if (reportPath) {
    const resolvedReport = path.resolve(reportPath);
    const summary = {
      generated_at: new Date().toISOString(),
      target_folder: dir,
      bucket,
      storage_prefix: storagePrefix,
      dry_run: dryRun,
      limit,
      counts: {
        files_discovered: discoveredTotal,
        files_in_batch: allFiles.length,
        skipped_duplicate: skippedDuplicate,
        failed_vision: failedVision,
        failed_upload: failedUpload,
        failed_db: failedDb,
        dry_run_simulated: dryRun ? dryRunProcessed : 0,
        storage_uploads: dryRun ? 0 : uploaded,
        db_upserts: dryRun ? 0 : upserted,
      },
      entries: reportEntries,
    };
    ensureDir(path.dirname(resolvedReport));
    fs.writeFileSync(resolvedReport, JSON.stringify(summary, null, 2), "utf8");
    console.log(`  report_written: ${resolvedReport}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
