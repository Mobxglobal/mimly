import "dotenv/config";

import fs from "fs";
import path from "path";

type DraftTemplate = {
  template_name: string;
  slug: string;
  image_filename: string;
  is_active: boolean;
  canvas_width: number;
  canvas_height: number;
  text_layout_type: string;
  pattern_type: string;
  meme_mechanic: string;
  template_logic: string;
  emotion_style: string;
  slot_1_role: string;
  slot_2_role: string | null;
  slot_3_role: string | null;
  slot_1_max_chars: number;
  slot_2_max_chars: number | null;
  slot_3_max_chars: number | null;
  slot_1_max_lines: number;
  slot_2_max_lines: number | null;
  slot_3_max_lines: number | null;
  text_transform: string | null;
  context_fit: string | null;
  business_fit: string | null;
  promotion_fit: boolean | null;
  seasonal_fit: string | null;
  weekday_fit: string | null;
  trend_fit: string | null;
  tags: string | null;
  example_output: string | null;
  quality_rank: number;
  slot_1_x: number;
  slot_1_y: number;
  slot_1_width: number;
  slot_1_height: number;
  slot_2_x: number | null;
  slot_2_y: number | null;
  slot_2_width: number | null;
  slot_2_height: number | null;
  slot_3_x: number | null;
  slot_3_y: number | null;
  slot_3_width: number | null;
  slot_3_height: number | null;
  font: string;
  font_size: number;
  alignment: string;
  text_color: string;
  stroke_color: string | null;
  stroke_width: number | null;
};

type SemanticFields = {
  pattern_type: string;
  meme_mechanic: string;
  template_logic: string;
  emotion_style: string;
  slot_1_role: string;
  example_output: string;
};

type CliOptions = {
  draftsDir: string;
  imagesDir: string;
  model: string;
  dryRun: boolean;
  limit: number | null;
  slug: string | null;
  reportPath: string;
};

type DraftRecord = {
  draftPath: string;
  draft: DraftTemplate;
};

type ReportEntry = {
  slug: string;
  status: "enriched" | "skipped" | "failed";
  semanticFields: SemanticFields | null;
  error: string | null;
  low_specificity_warning?: string | null;
};

const DEFAULT_DRAFTS_DIR = "./templates/drafts";
const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_REPORT_PATH = "./templates/reports/semantic-enrichment-report.json";

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
  const draftsDir = getArg("drafts") ?? DEFAULT_DRAFTS_DIR;
  const imagesDir = getArg("images");
  const model = getArg("model") ?? DEFAULT_MODEL;
  const dryRun = parseBooleanArg(getArg("dry-run"), false);
  const limit = parseNumberArg(getArg("limit"));
  const slug = (getArg("slug") ?? "").trim() || null;
  const reportPath = getArg("report") ?? DEFAULT_REPORT_PATH;

  if (!imagesDir) {
    throw new Error("Missing required --images argument");
  }

  return {
    draftsDir,
    imagesDir,
    model,
    dryRun,
    limit,
    slug,
    reportPath,
  };
}

function safeJsonParse(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }
    try {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function normalizeSingleLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function looksAllCapsShouty(value: string): boolean {
  const lettersOnly = value.replace(/[^a-zA-Z]/g, "");
  if (lettersOnly.length < 3) return false;
  return lettersOnly === lettersOnly.toUpperCase();
}

function normalizeToSentenceCase(value: string): string {
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function isDraftTemplate(value: unknown): value is DraftTemplate {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<DraftTemplate>;
  return (
    typeof draft.template_name === "string" &&
    typeof draft.slug === "string" &&
    typeof draft.image_filename === "string"
  );
}

function validateSemanticFields(value: unknown): {
  success: true;
  data: SemanticFields;
} | {
  success: false;
  error: string;
} {
  if (!value || typeof value !== "object") {
    return { success: false, error: "Model output was not an object" };
  }

  const record = value as Record<string, unknown>;
  const allowedKeys = [
    "pattern_type",
    "meme_mechanic",
    "template_logic",
    "emotion_style",
    "slot_1_role",
    "example_output",
  ];
  const extraKeys = Object.keys(record).filter((key) => !allowedKeys.includes(key));
  const missingKeys = allowedKeys.filter((key) => !(key in record));

  if (missingKeys.length > 0) {
    return { success: false, error: `Missing required keys: ${missingKeys.join(", ")}` };
  }

  if (extraKeys.length > 0) {
    return { success: false, error: `Unexpected keys returned: ${extraKeys.join(", ")}` };
  }

  const semanticFields: SemanticFields = {
    pattern_type: normalizeSingleLine(record.pattern_type) ?? "",
    meme_mechanic: normalizeSingleLine(record.meme_mechanic) ?? "",
    template_logic: normalizeSingleLine(record.template_logic) ?? "",
    emotion_style: normalizeSingleLine(record.emotion_style) ?? "",
    slot_1_role: normalizeSingleLine(record.slot_1_role) ?? "",
    example_output: normalizeSingleLine(record.example_output) ?? "",
  };

  const requiredKeys = Object.keys(semanticFields) as Array<keyof SemanticFields>;
  for (const key of requiredKeys) {
    if (!semanticFields[key]) {
      return { success: false, error: `Missing or empty field: ${key}` };
    }
  }

  if (!/^[a-z_]{3,40}$/.test(semanticFields.pattern_type)) {
    return { success: false, error: "pattern_type must be a concise lowercase underscore label" };
  }

  if (!/^[a-z0-9_]{3,60}$/.test(semanticFields.meme_mechanic)) {
    return { success: false, error: "meme_mechanic must be concise snake_case" };
  }

  if (semanticFields.template_logic.length > 220) {
    return { success: false, error: "template_logic is too long" };
  }

  if (
    semanticFields.emotion_style.length > 40 ||
    semanticFields.emotion_style.split(/\s+/).length > 3 ||
    /[.!?]/.test(semanticFields.emotion_style)
  ) {
    return { success: false, error: "emotion_style must be a short emotional label" };
  }

  if (semanticFields.slot_1_role.length > 80) {
    return { success: false, error: "slot_1_role is too long" };
  }

  if (semanticFields.example_output.length > 120) {
    return { success: false, error: "example_output is too long" };
  }

  return { success: true, data: semanticFields };
}

function getLowSpecificityWarning(semanticFields: SemanticFields): string | null {
  const exampleOutput = semanticFields.example_output.trim();
  const templateLogic = semanticFields.template_logic.trim();

  const bannedGenericExamples = new Set([
    "WHEN THE CLIENT SAYS THEY NEED IT TODAY",
  ]);

  const genericTemplateLogic = new Set([
    "A caption describing something shocking, unexpected, or hard to believe.",
    "A caption expressing confusion or disbelief about a situation or statement.",
  ]);

  if (bannedGenericExamples.has(exampleOutput)) {
    return "example_output uses a banned generic repeated caption";
  }

  if (
    semanticFields.meme_mechanic === "shock_reaction" &&
    semanticFields.emotion_style === "surprised" &&
    genericTemplateLogic.has(templateLogic)
  ) {
    return "mechanic/emotion/template_logic combination is very generic for this template family";
  }

  if (
    semanticFields.meme_mechanic === "shock_reaction" &&
    semanticFields.emotion_style === "surprised" &&
    exampleOutput.split(/\s+/).length <= 8
  ) {
    return "shock_reaction + surprised may be too generic; review image-specificity";
  }

  return null;
}

function applyBatchSpecificityWarnings(entries: ReportEntry[]): ReportEntry[] {
  const exampleOutputCounts = new Map<string, number>();
  const templateLogicCounts = new Map<string, number>();

  for (const entry of entries) {
    if (entry.status !== "enriched" || !entry.semanticFields) continue;
    const exampleKey = entry.semanticFields.example_output.trim();
    const logicKey = entry.semanticFields.template_logic.trim();
    exampleOutputCounts.set(exampleKey, (exampleOutputCounts.get(exampleKey) ?? 0) + 1);
    templateLogicCounts.set(logicKey, (templateLogicCounts.get(logicKey) ?? 0) + 1);
  }

  return entries.map((entry) => {
    if (entry.status !== "enriched" || !entry.semanticFields) {
      return entry;
    }

    const warnings: string[] = [];
    if (entry.low_specificity_warning) {
      warnings.push(entry.low_specificity_warning);
    }

    const exampleKey = entry.semanticFields.example_output.trim();
    const logicKey = entry.semanticFields.template_logic.trim();

    if ((exampleOutputCounts.get(exampleKey) ?? 0) > 1) {
      warnings.push("example_output is duplicated across multiple templates in this batch");
    }

    if ((templateLogicCounts.get(logicKey) ?? 0) > 2) {
      warnings.push("template_logic is repeated across too many templates in this batch");
    }

    return {
      ...entry,
      low_specificity_warning: warnings.length > 0 ? warnings.join("; ") : null,
    };
  });
}

function loadDraftRecords(options: CliOptions): DraftRecord[] {
  const draftFiles = fs
    .readdirSync(options.draftsDir)
    .filter((file) => file.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const records: DraftRecord[] = [];
  for (const file of draftFiles) {
    const draftPath = path.join(options.draftsDir, file);
    const raw = fs.readFileSync(draftPath, "utf8");
    const parsed = safeJsonParse(raw);

    if (!isDraftTemplate(parsed)) {
      throw new Error(`Invalid draft JSON shape: ${draftPath}`);
    }

    if (options.slug && parsed.slug !== options.slug) {
      continue;
    }

    records.push({ draftPath, draft: parsed });
  }

  if (options.limit != null) {
    return records.slice(0, options.limit);
  }

  return records;
}

function findImagePath(imagesDir: string, imageFilename: string): string | null {
  const exactPath = path.join(imagesDir, imageFilename);
  if (fs.existsSync(exactPath)) {
    return exactPath;
  }

  const normalizedTarget = imageFilename.trim().toLowerCase();
  const allFiles = fs.readdirSync(imagesDir);
  const caseInsensitiveMatch = allFiles.find(
    (file) => file.trim().toLowerCase() === normalizedTarget
  );

  return caseInsensitiveMatch ? path.join(imagesDir, caseInsensitiveMatch) : null;
}

function getImageDataUrl(imagePath: string): string {
  const buffer = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : "image/png";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function buildPrompt(draft: DraftTemplate): string {
  return `You are classifying a square image meme template for a meme generator system.

Context:
- This is a 1-slot top-caption meme template.
- The caption sits above the image and frames the image's emotional meaning.
- The image will be used with exactly one caption above it.
- Classify the meme for how brands, businesses, creators, and marketers would most likely caption it in a meme generator system.
- Classify by likely caption behavior, not by literal scene description alone.
- Choose the most specific reusable meme mechanic that fits the image.
- Do not collapse different templates into the same generic classification unless they are genuinely near-identical in caption behavior.
- Differentiate carefully between shock, disbelief, confusion, dread, overwhelmed reaction, smugness, approval, suspicious thinking, awkwardness, and calm-in-chaos.
- Prefer concise, reusable, production-friendly labels over vague generic ones.
- Do not mention layout, coordinates, font, or styling.
- Output JSON only.

Guidance:
- pattern_type should usually be one of: reaction, opinion, comparison, setup_payoff
- meme_mechanic should be concise snake_case and reusable. Strong examples: shock_reaction, disbelief_reaction, confused_reaction, dread_reaction, overwhelmed_reaction, smug_reaction, approval_reaction, suspicious_thinking, awkward_reaction, calm_in_chaos, exhausted_reaction, desperate_reaction.
- You may choose another concise snake_case mechanic only if it is clearly better and still reusable.
- emotion_style should be a short emotional label only, such as: surprised, shocked, confused, smug, pleased, awkward, chaotic, exhausted, resigned, desperate, suspicious, overwhelmed, confident
- template_logic should explain the caption behavior in one concise sentence
- slot_1_role should describe what the top caption is doing structurally
- example_output must be short, feel meme-native, fit a top-caption format, and reflect the distinctive vibe of this exact image
- example_output must be written in natural sentence case and never in ALL CAPS
- example_output should feel like a realistic meme caption someone would actually post
- example_output should be a complete thought, not a fragment
- example_output should avoid generic repeated placeholders across a batch
- example_output should not be overly long or overly specific to one industry
- Avoid reusing generic examples such as "WHEN THE CLIENT SAYS THEY NEED IT TODAY" unless it is truly the best fit for this exact image

Template context:
- template_name: ${draft.template_name}
- slug: ${draft.slug}
- text_layout_type: ${draft.text_layout_type}
- slot_1_max_chars: ${draft.slot_1_max_chars}
- slot_1_max_lines: ${draft.slot_1_max_lines}

Return exactly this JSON shape:
{
  "pattern_type": "reaction",
  "meme_mechanic": "shock_reaction",
  "template_logic": "A caption describing something shocking, unexpected, or hard to believe.",
  "emotion_style": "surprised",
  "slot_1_role": "shock reaction caption",
  "example_output": "When you realize that was the plan"
}`;
}

async function requestSemanticFields(params: {
  apiKey: string;
  model: string;
  draft: DraftTemplate;
  imagePath: string;
}): Promise<SemanticFields> {
  const { apiKey, model, draft, imagePath } = params;
  const imageDataUrl = getImageDataUrl(imagePath);
  const prompt = buildPrompt(draft);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You classify meme templates for a generator system. Return JSON only with the exact requested keys.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonParse(String(content));
  const validated = validateSemanticFields(parsed);

  if (!validated.success) {
    throw new Error(`Invalid model output: ${validated.error}`);
  }

  const normalizedSemanticFields: SemanticFields = {
    ...validated.data,
    example_output: looksAllCapsShouty(validated.data.example_output)
      ? normalizeToSentenceCase(validated.data.example_output)
      : validated.data.example_output,
  };

  return normalizedSemanticFields;
}

function mergeSemanticFields(draft: DraftTemplate, semanticFields: SemanticFields): DraftTemplate {
  return {
    ...draft,
    pattern_type: semanticFields.pattern_type,
    meme_mechanic: semanticFields.meme_mechanic,
    template_logic: semanticFields.template_logic,
    emotion_style: semanticFields.emotion_style,
    slot_1_role: semanticFields.slot_1_role,
    example_output: semanticFields.example_output,
  };
}

function writeReport(reportPath: string, entries: ReportEntry[]): void {
  ensureDir(path.dirname(reportPath));
  fs.writeFileSync(reportPath, JSON.stringify(entries, null, 2), "utf8");
}

async function main(): Promise<void> {
  const options = parseArgs();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Set it in your environment before running this script.");
  }

  if (!fs.existsSync(options.draftsDir)) {
    throw new Error(`Drafts directory does not exist: ${options.draftsDir}`);
  }

  if (!fs.existsSync(options.imagesDir)) {
    throw new Error(`Images directory does not exist: ${options.imagesDir}`);
  }

  const draftRecords = loadDraftRecords(options);
  const reportEntries: ReportEntry[] = [];

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let missingImages = 0;
  let invalidModelOutputs = 0;

  console.log(`Drafts folder: ${options.draftsDir}`);
  console.log(`Images folder: ${options.imagesDir}`);
  console.log(`Model: ${options.model}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Drafts found: ${draftRecords.length}`);

  for (const record of draftRecords) {
    const { draft, draftPath } = record;
    const imagePath = findImagePath(options.imagesDir, draft.image_filename);

    if (!imagePath) {
      skipped++;
      missingImages++;
      reportEntries.push({
        slug: draft.slug,
        status: "skipped",
        semanticFields: null,
        error: `Missing image: ${draft.image_filename}`,
        low_specificity_warning: null,
      });
      console.log(`skipped: ${draft.slug} (missing image)`);
      continue;
    }

    processed++;

    try {
      const semanticFields = await requestSemanticFields({
        apiKey,
        model: options.model,
        draft,
        imagePath,
      });

      if (options.dryRun) {
        console.log(`enriched: ${draft.slug}`);
        console.log(JSON.stringify(semanticFields, null, 2));
      } else {
        const merged = mergeSemanticFields(draft, semanticFields);
        fs.writeFileSync(draftPath, JSON.stringify(merged, null, 2), "utf8");
        console.log(`enriched: ${draft.slug}`);
      }

      updated++;
      const lowSpecificityWarning = getLowSpecificityWarning(semanticFields);
      if (lowSpecificityWarning) {
        console.log(`warning: ${draft.slug} (${lowSpecificityWarning})`);
      }
      reportEntries.push({
        slug: draft.slug,
        status: "enriched",
        semanticFields,
        error: null,
        low_specificity_warning: lowSpecificityWarning,
      });
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : "unknown error";
      if (message.startsWith("Invalid model output:")) {
        invalidModelOutputs++;
      }
      reportEntries.push({
        slug: draft.slug,
        status: "failed",
        semanticFields: null,
        error: message,
        low_specificity_warning: null,
      });
      console.log(`failed: ${draft.slug} (${message})`);
    }
  }

  const enrichedReportEntries = applyBatchSpecificityWarnings(reportEntries);

  for (const entry of enrichedReportEntries) {
    if (entry.status === "enriched" && entry.low_specificity_warning) {
      console.log(`review: ${entry.slug} (${entry.low_specificity_warning})`);
    }
  }

  writeReport(options.reportPath, enrichedReportEntries);

  console.log("\nSummary");
  console.log(`Drafts found: ${draftRecords.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Missing images: ${missingImages}`);
  console.log(`Invalid model outputs: ${invalidModelOutputs}`);
  console.log(`Report written: ${options.reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
