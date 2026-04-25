import { randomUUID } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/actions/profile";
import {
  englishVariantPromptInstruction,
  resolveEffectiveEnglishVariant,
} from "@/lib/onboarding/english-variant";
import { renderVerticalSlideshowSlidePng } from "@/renderer/renderVerticalSlideshowSlide";
import type { VerticalSlideshowRenderStyle } from "@/renderer/renderVerticalSlideshowSlide";
import { getActiveImportantDay } from "@/lib/memes/variants/get-active-important-day";
import { resolveSlideAsset } from "@/lib/memes/slideshow/match-slide-asset";
import { validateSlideshowLlmOutput } from "@/lib/memes/slideshow/validate-slideshow-llm";
import {
  DEFAULT_SLIDESHOW_CONFIG,
  SLIDESHOW_ROLE_LADDERS,
  type SlideshowTemplateConfig,
  type SlideshowVariantMetadata,
  type SlideshowImageAssetRecord,
  type ValidatedSlideshowPayload,
} from "@/lib/memes/slideshow/types";
import {
  deriveWorkspaceFamilyTemplateHistory,
  selectTemplatesFromWorkspaceFamilyCycle,
} from "@/lib/workspace/template-cycle";
import { normalizeFinalMemeText } from "@/lib/memes/sanitize-meme-text";

const TITLE_MAX_CHARS = 45;
const PROMOTION_MAX_CHARS = 280;
type PromoMode = "none" | "light" | "direct";
type AssignedVariant = "standard" | "promo" | "important_day";

type SlideshowTemplate = {
  template_id: string;
  template_name: string;
  slug: string;
  template_logic: string;
  emotion_style: string;
  context_fit: string;
  business_fit: string;
  promotion_fit: string;
  example_output: string;
  slideshow_config: SlideshowTemplateConfig;
};

function safeJsonParse(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace)
      return null;
    try {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

/** Max chars per log field — keeps server logs readable; increase locally if needed. */
const SLIDESHOW_DEBUG_JSON_MAX = 6000;

function truncateForLog(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  const head = Math.floor(max * 0.62);
  const tail = max - head - 40;
  return {
    text: `${s.slice(0, head)}\n…[truncated ${s.length - head - tail} chars]…\n${s.slice(-tail)}`,
    truncated: true,
  };
}

function safeStringifyForLog(value: unknown, max: number): { text: string; truncated: boolean } {
  try {
    return truncateForLog(JSON.stringify(value), max);
  } catch {
    return truncateForLog(String(value), max);
  }
}

/** Shape the validator will see (keys, role, text presence) — before validateSlideshowLlmOutput. */
function summarizeSlideshowValidationInput(parsed: unknown): Record<string, unknown> {
  if (parsed == null) return { value: null };
  if (typeof parsed !== "object") {
    return { typeof: typeof parsed };
  }
  const p = parsed as Record<string, unknown>;
  const slides = p.slides;
  const slideParts = Array.isArray(slides)
    ? slides.map((s, i) => {
        if (s == null || typeof s !== "object") {
          return { index: i, invalid: true, raw: String(s) };
        }
        const o = s as Record<string, unknown>;
        const text = o.text;
        return {
          index: i,
          keys: Object.keys(o).sort(),
          role_raw: o.role,
          role_norm: String(o.role ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_"),
          text_type: typeof text,
          text_len: typeof text === "string" ? text.length : null,
          text_preview:
            typeof text === "string"
              ? text.slice(0, 100).replace(/\r?\n/g, "\\n")
              : null,
          layout_variant: o.layout_variant,
          has_image_selection:
            o.image_selection != null && typeof o.image_selection === "object",
        };
      })
    : { error: "slides_not_array", slides_typeof: typeof slides };

  return {
    slide_count_raw: p.slide_count,
    slide_count_typeof: typeof p.slide_count,
    has_slideshow_intent: typeof p.slideshow_intent === "string",
    slideshow_intent_len:
      typeof p.slideshow_intent === "string" ? p.slideshow_intent.length : null,
    slides_array_length: Array.isArray(slides) ? slides.length : null,
    slides: slideParts,
  };
}

function isActive(t: Record<string, unknown>): boolean {
  if (typeof t.is_active === "boolean") return t.is_active;
  if (typeof t.active === "boolean") return t.active;
  if (typeof t.status === "string")
    return t.status.toLowerCase() === "active";
  return true;
}

function normalizePromotionContext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.slice(0, PROMOTION_MAX_CHARS).trim() || null;
}

function loadSlideshowTemplates(rows: unknown[]): SlideshowTemplate[] {
  return rows
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .filter((t) => isActive(t))
    .filter(
      (t) =>
        String(t.template_family ?? "square_meme").trim() === "vertical_slideshow"
    )
    .map((t) => {
      const template_id = String(
        t.template_id ?? t.id ?? t.slug ?? ""
      ).trim();
      const rawConfig = t.slideshow_config;
      const slideshow_config: SlideshowTemplateConfig =
        rawConfig && typeof rawConfig === "object"
          ? (rawConfig as SlideshowTemplateConfig)
          : {};
      return {
        template_id,
        template_name: String(t.template_name ?? t.name ?? "").trim(),
        slug: String(t.slug ?? "").trim(),
        template_logic: String(t.template_logic ?? "").trim(),
        emotion_style: String(t.emotion_style ?? "").trim(),
        context_fit: String(t.context_fit ?? "").trim(),
        business_fit: String(t.business_fit ?? "").trim(),
        promotion_fit: String(t.promotion_fit ?? "").trim(),
        example_output: String(t.example_output ?? "").trim(),
        slideshow_config,
      };
    })
    .filter((t) => t.template_id && t.template_name && t.slug);
}

function buildStyle(config: SlideshowTemplateConfig): VerticalSlideshowRenderStyle {
  return {
    ...DEFAULT_SLIDESHOW_CONFIG,
    ...config,
  };
}

function mapAssetRow(row: Record<string, unknown>): SlideshowImageAssetRecord {
  const tags = row.industry_tags;
  return {
    id: String(row.id ?? ""),
    storage_path: String(row.storage_path ?? ""),
    public_url: row.public_url ? String(row.public_url) : null,
    theme: row.theme != null ? String(row.theme) : null,
    mood: row.mood != null ? String(row.mood) : null,
    setting: row.setting != null ? String(row.setting) : null,
    subject_type: row.subject_type != null ? String(row.subject_type) : null,
    industry_tags: Array.isArray(tags)
      ? tags.map((x) => String(x).trim()).filter(Boolean)
      : [],
    color_profile: row.color_profile != null ? String(row.color_profile) : null,
    text_overlay_suitability:
      row.text_overlay_suitability != null
        ? String(row.text_overlay_suitability)
        : null,
    layout_a_fit:
      row.layout_a_fit != null && row.layout_a_fit !== ""
        ? Number(row.layout_a_fit)
        : null,
    layout_b_fit:
      row.layout_b_fit != null && row.layout_b_fit !== ""
        ? Number(row.layout_b_fit)
        : null,
    summary: row.summary != null ? String(row.summary) : null,
  };
}

async function downloadAssetBuffer(params: {
  admin: SupabaseClient;
  asset: SlideshowImageAssetRecord;
  bucket: string;
}): Promise<Buffer> {
  const { admin, asset, bucket } = params;
  if (asset.public_url) {
    const res = await fetch(asset.public_url);
    if (!res.ok) throw new Error(`fetch asset failed ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const { data, error } = await admin.storage
    .from(bucket)
    .download(asset.storage_path);
  if (error || !data) {
    throw new Error(error?.message || "download asset failed");
  }
  return Buffer.from(await (data as Blob).arrayBuffer());
}

function getPromoSuitabilityScore(template: SlideshowTemplate): number {
  const fit = template.promotion_fit.toLowerCase().trim();
  if (!fit) return 0;
  const noneSignals = [
    "avoid",
    "bad fit",
    "poor fit",
    "not fit",
    "weak fit",
    "no promo",
    "ignore promo",
    "general only",
    "brand only",
  ];
  if (noneSignals.some((s) => fit.includes(s))) return -100;
  let score = 0;
  const directSignals = [
    "promotion",
    "promo",
    "deal",
    "offer",
    "sale",
    "discount",
  ];
  for (const s of directSignals) if (fit.includes(s)) score += 3;
  const lightSignals = ["light", "subtle", "soft", "indirect", "contextual"];
  for (const s of lightSignals) if (fit.includes(s)) score += 1;
  return score;
}

function derivePromoMode(
  template: SlideshowTemplate,
  promotion: string | null
): PromoMode {
  if (!promotion) return "none";
  const fit = template.promotion_fit.toLowerCase();
  if (
    ["avoid", "bad fit", "poor fit", "not fit", "weak fit", "no promo"].some(
      (s) => fit.includes(s)
    )
  ) {
    return "none";
  }
  if (
    ["promotion", "promo", "deal", "offer", "sale", "discount"].some((s) =>
      fit.includes(s)
    )
  ) {
    return "direct";
  }
  return "light";
}

function buildSlideshowPrompt(params: {
  template: SlideshowTemplate;
  profile: Profile;
  promotion: string | null;
  promoMode: PromoMode;
  variantType: AssignedVariant;
  conversationContext?: {
    latestGenerationRequest?: string | null;
    workspaceContextSummary?: string | null;
    recentRefinementContext?: string | null;
    explicitPromoIntent?: boolean;
    promoContextExcerpt?: string | null;
  };
  importantDayBlock: string;
  retryHint: string | null;
}): string {
  const {
    template,
    profile,
    promotion,
    promoMode,
    variantType,
    conversationContext,
    importantDayBlock,
    retryHint,
  } = params;
  const cfg = { ...DEFAULT_SLIDESHOW_CONFIG, ...template.slideshow_config };
  const latestGenerationRequest = String(
    conversationContext?.latestGenerationRequest ?? ""
  ).trim();
  const workspaceContextSummary = String(
    conversationContext?.workspaceContextSummary ?? ""
  ).trim();
  const recentRefinementContext = String(
    conversationContext?.recentRefinementContext ?? ""
  ).trim();
  const explicitPromoIntent = Boolean(conversationContext?.explicitPromoIntent);
  const promoContextExcerpt = String(
    conversationContext?.promoContextExcerpt ?? ""
  ).trim();

  const promoGuidance =
    variantType !== "promo"
      ? "No promotion: keep this observational and non-promotional."
      : promoMode === "direct"
        ? "Direct promo: you may name the offer/context plainly, but keep spoken and meme-native (not slogan-style)."
        : promoMode === "light"
          ? "Light promo: one subtle nod max."
          : "Promo variant with weak fit: keep it observational and non-salesy.";

  return `=== OUTPUT CONTRACT (STRICT) ===
Return valid JSON only (no markdown, no extra prose).

slide_count MUST be 3, 4, or 5 only. slides.length MUST equal slide_count.
Role ladder is fixed by slide_count:
- 3 slides -> hook, turn, payoff
- 4 slides -> hook, build, turn, payoff
- 5 slides -> hook, build, build, turn, payoff

For each index i, slides[i].role MUST equal the exact ladder token at i.
Allowed roles only: hook, build, turn, payoff.

Each slide MUST include:
- role
- text
- layout_variant ("layout_a" | "layout_b")
- image_selection object

Top-level fields:
- slide_count
- slideshow_intent (observational arc; non-promotional; minimum 8 meaningful characters)
- slides

=== RENDER SAFETY (MUST PASS) ===
Each slide.text must be single-line JSON text (no newline characters).
Each slide.text must not end with a trailing comma.
layout_variant rules:
- layout_a = shorter, punchier phrasing
- layout_b = can carry slightly more words, still skimmable and concise

Hard limits from template config:
- layout_a: max ${cfg.layout_a_max_chars} chars per wrapped line, max ${cfg.layout_a_max_lines} wrapped lines
- layout_b: max ${cfg.layout_b_max_chars} chars per wrapped line, max ${cfg.layout_b_max_lines} wrapped lines

image_selection schema keys (exact):
theme, mood, setting, subject_type, industry_tags, color_profile
Optional: min_layout_fit_score (integer 0-10)
Do not use other keys.

Each slide must use a meaningfully different image_selection from the other slides (vary theme, mood, setting, subject_type, tags, and/or color_profile) so the sequence does not repeat the same background look.

Controlled vocabulary:
- theme: comfort | discomfort | luxury | productivity | cleanliness | stress | relief | lifestyle
- mood: calm | warm | cool | serious | aspirational | frustrated
- setting: home_interior | home_exterior | office | outdoor_urban | commercial_interior
- subject_type: environment | person | product | detail
- industry_tags: array of max 6 short snake_case tags (e.g. ["saas","b2b"])
- color_profile: warm | cool | neutral | high_contrast | muted | monochrome

=== CREATIVE OBJECTIVE ===
Write a TikTok/Reels-native vertical slideshow (1080x1920) that feels like a real observation, not an ad.
Target lines that are:
- specific and lived-in (real moments, concrete details)
- concise and spoken (natural to say out loud)
- memorable on first read (not generic social filler)

Avoid:
- CTA/hype/campaign phrasing
- empty question hooks
- abstract business-safe language that could fit any brand
- corporate tone or polished slogan voice

=== ROLE WRITING RULES ===
hook:
- open with a surprising, uncomfortable, or sharply relatable truth
- statement only (not a question or claim line)

build (when present):
- make the situation concrete and tangible
- show pattern/friction, avoid abstractions

turn:
- reframe the situation clearly
- declarative, not advice; can be short two-beat phrasing when natural

payoff:
- land with hindsight clarity / consequence
- no CTA, no offer language, no hard sell

Quality check before returning JSON:
- each slide is a distinct idea (no near-duplicates)
- lines stay observational, specific, and easy to scan
- if a line feels obvious/generic, rewrite it sharper

=== CONTEXT ===
Mode: observational social storytelling.

Conversation context:
- latest_generation_request: ${latestGenerationRequest || "None"}
- workspace_context_summary: ${workspaceContextSummary || "None"}
- recent_refinement_context: ${recentRefinementContext || "None"}
- explicit_promo_intent: ${explicitPromoIntent ? "true" : "false"}
- promo_context_excerpt: ${promoContextExcerpt || "None"}

Brand context:
- brand_name: ${profile.brand_name ?? ""}
- what_you_do: ${profile.what_you_do ?? ""}
- audience: ${profile.audience ?? ""}
- country: ${profile.country ?? ""}
- ${englishVariantPromptInstruction(resolveEffectiveEnglishVariant(profile.english_variant))}

Promotion context (this generation):
Promotion context: ${promotion ?? "None"}
Variant: ${variantType} | Promo mode: ${variantType === "promo" ? promoMode : "none"}
${promoGuidance}

Template brief:
- template_name: ${template.template_name}
- slug: ${template.slug}
- template_logic: ${template.template_logic}
- emotion_style: ${template.emotion_style}
- context_fit: ${template.context_fit}
- business_fit: ${template.business_fit}
- promotion_fit: ${template.promotion_fit}
- example_output: ${template.example_output}

${importantDayBlock}

${retryHint ? `=== RETRY CORRECTION ===\nFix the previous attempt:\n${retryHint}\n` : ""}`;
}

export async function runVerticalSlideshowGeneration(params: {
  supabase: SupabaseClient;
  adminSupabase: SupabaseClient;
  user: User | null;
  profile: Profile;
  promotionContext?: string;
  context?: {
    latestGenerationRequest?: string | null;
    workspaceContextSummary?: string | null;
    recentRefinementContext?: string | null;
    explicitPromoIntent?: boolean;
    promoContextExcerpt?: string | null;
  };
  options?: {
    limit?: number;
    excludeExistingUserTemplates?: boolean;
    forcedTemplateId?: string;
    forceStandardVariant?: boolean;
    generationRunIdOverride?: string;
    contentPack?: { batch: 1 | 2 | 3 };
    workspaceContext?: {
      workspaceId?: string | null;
      storagePathNamespace?: string | null;
    };
  };
}): Promise<{ error: string | null }> {
  const {
    supabase,
    adminSupabase,
    user,
    profile,
    promotionContext,
    context,
    options,
  } = params;

  const storageNamespace =
    options?.workspaceContext?.storagePathNamespace?.trim() ||
    user?.id ||
    "anonymous";

  const promotion = normalizePromotionContext(promotionContext);
  const batchSize = options?.limit ?? 1;
  const forcedTemplateId =
    String(options?.forcedTemplateId ?? "").trim() || null;
  const forceStandardVariant = Boolean(options?.forceStandardVariant);
  const generationRunId = options?.generationRunIdOverride ?? randomUUID();
  const batchNumber = options?.contentPack?.batch ?? 1;
  const activeImportantDay = getActiveImportantDay();

  if (!process.env.OPENAI_API_KEY) {
    return { error: "Server misconfiguration (OpenAI key)." };
  }

  const { data: templatesRaw, error: templatesError } = await adminSupabase
    .from("meme_templates")
    .select("*");

  if (templatesError) {
    console.error("[slideshow-gen] template fetch failed", templatesError);
    return { error: templatesError.message || "Failed to load templates." };
  }

  const slideshowTemplates = loadSlideshowTemplates(templatesRaw ?? []);
  if (!slideshowTemplates.length) {
    return {
      error:
        "No active vertical_slideshow templates. Add meme_templates rows with template_family = vertical_slideshow.",
    };
  }

  const { data: assetRows, error: assetsError } = await adminSupabase
    .from("slideshow_image_assets")
    .select("*")
    .order("id", { ascending: true });

  if (assetsError) {
    console.error("[slideshow-gen] assets fetch failed", assetsError);
    return { error: assetsError.message || "Failed to load slideshow image library." };
  }

  const assets = (assetRows ?? [])
    .filter((r) => r && typeof r === "object")
    .map((r) => mapAssetRow(r as Record<string, unknown>))
    .filter((a) => a.id && a.storage_path);

  if (!assets.length) {
    return {
      error:
        "Slideshow image library is empty. Run scripts/slideshow/ingest-tt-slideshow.ts to ingest assets.",
    };
  }

  const excluded = new Set<string>();
  if (options?.excludeExistingUserTemplates && user) {
    const { data: existing, error: exErr } = await supabase
      .from("generated_memes")
      .select("template_id")
      .eq("user_id", user.id)
      .not("template_id", "is", null);
    if (exErr) {
      return { error: exErr.message || "Failed to load existing generations." };
    }
    for (const row of existing ?? []) {
      const id = String((row as { template_id?: string }).template_id ?? "").trim();
      if (id) excluded.add(id);
    }
  }

  let pool = slideshowTemplates
    .filter((t) => !excluded.has(t.template_id));

  if (forcedTemplateId) {
    pool = slideshowTemplates.filter(
      (t) =>
        t.template_id === forcedTemplateId || t.slug === forcedTemplateId
    );
  }

  if (!pool.length) {
    return {
      error: forcedTemplateId
        ? "Slideshow template not found for regeneration."
        : "No slideshow templates left to generate.",
    };
  }

  let cycleDiagnostics: Record<string, unknown> = {
    selection_scope: "workspace_family_cycle",
    output_family: "vertical_slideshow",
    eligible_pool_size: pool.length,
    used_pool_size_before_pick: 0,
    unused_pool_size_before_pick: pool.length,
    cooldown_window_size: 3,
    cooldown_applied: false,
    cycle_exhausted: false,
    cycle_reset_applied: false,
    selected_template_id: null,
    selected_template_slug: null,
    selection_stage: "unused_pool",
  };
  let selected: SlideshowTemplate[] = [];
  if (options?.workspaceContext?.workspaceId) {
    const { data: recentWorkspaceRows } = await adminSupabase
      .from("generated_memes")
      .select("template_id, created_at")
      .contains("variant_metadata", {
        workspace_id: options.workspaceContext.workspaceId,
      })
      .order("created_at", { ascending: false })
      .limit(500);
    const eligibleTemplateIds = new Set(pool.map((template) => template.template_id));
    const history = deriveWorkspaceFamilyTemplateHistory({
      rows: (recentWorkspaceRows ?? []) as Array<{ template_id?: unknown }>,
      eligibleTemplateIds,
      cooldownWindow: 3,
    });
    const cycle = selectTemplatesFromWorkspaceFamilyCycle({
      eligibleTemplates: pool,
      usedTemplateIds: history.usedTemplateIds,
      recentTemplateIds: history.recentTemplateIds,
      outputFamily: "vertical_slideshow",
      count: batchSize,
      cooldownWindow: 3,
    });
    selected = cycle.selected;
    cycleDiagnostics = cycle.diagnostics as Record<string, unknown>;
  }
  if (selected.length === 0) {
    const cycle = selectTemplatesFromWorkspaceFamilyCycle({
      eligibleTemplates: pool,
      usedTemplateIds: new Set<string>(),
      recentTemplateIds: [],
      outputFamily: "vertical_slideshow",
      count: batchSize,
      cooldownWindow: 3,
    });
    selected = cycle.selected;
    cycleDiagnostics = cycle.diagnostics as Record<string, unknown>;
  }
  const assignedVariants: AssignedVariant[] = new Array(selected.length).fill(
    "standard"
  );

  if (!forceStandardVariant && promotion && selected.length) {
    let bestI = 0;
    let bestS = getPromoSuitabilityScore(selected[0]);
    for (let i = 1; i < selected.length; i++) {
      const s = getPromoSuitabilityScore(selected[i]);
      if (s > bestS) {
        bestS = s;
        bestI = i;
      }
    }
    if (bestS > -50) assignedVariants[bestI] = "promo";
  }

  if (!forceStandardVariant && activeImportantDay && selected.length) {
    const promoI = assignedVariants.indexOf("promo");
    const dayI = selected.findIndex((_, i) => i !== promoI);
    if (dayI >= 0) assignedVariants[dayI] = "important_day";
    else assignedVariants[0] = "important_day";
  }

  const generatedMemeBucket =
    process.env.MEME_GENERATED_MEMES_BUCKET ?? "generated-memes";
  const slideshowAssetsBucket =
    process.env.SLIDESHOW_ASSETS_BUCKET ?? "slideshow-assets";

  let inserted = 0;

  for (let ti = 0; ti < selected.length; ti++) {
    const template = selected[ti];
    const variantType = assignedVariants[ti] ?? "standard";
    const promoMode = derivePromoMode(template, promotion);
    const importantDayBlock =
      variantType === "important_day" && activeImportantDay
        ? `Important day: ${activeImportantDay.label}\nContext: ${activeImportantDay.promptContext ?? ""}`
        : "";

    let previousFailure: string | null = null;
    let payload: ValidatedSlideshowPayload | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const retryHint = previousFailure
        ? `Validation failed: ${previousFailure}. Fix JSON to satisfy all rules.`
        : null;

      const prompt = buildSlideshowPrompt({
        template,
        profile,
        promotion: variantType === "promo" ? promotion : null,
        promoMode,
        variantType,
        conversationContext: context,
        importantDayBlock,
        retryHint,
      });

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.55,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You output only valid JSON (json_object). No markdown, no prose outside JSON. Slides must follow the role ladder for the chosen slide_count. Observational mode: no ad copy, no What if/Are you question hooks, no CTA verbs (upgrade, save money, transform, boost, etc.). Lines must be sharp and vivid, not first-pass obvious; still short and spoken. Never use em dash or en dash in any string. Each image_selection must use keys theme, mood, setting, subject_type, industry_tags, color_profile (exact names) with enum values from the user prompt.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        previousFailure = "openai_error";
        continue;
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json?.choices?.[0]?.message?.content ?? "{}";
      const rawString = String(content);

      const rawLog = truncateForLog(rawString, SLIDESHOW_DEBUG_JSON_MAX);
      console.log("[slideshow-gen-debug] 1_openai_raw_message_content", {
        slug: template.slug,
        attempt,
        char_length: rawString.length,
        truncated: rawLog.truncated,
        raw_json: rawLog.text,
      });

      const parsed = safeJsonParse(rawString);
      const parsedLog = safeStringifyForLog(parsed, SLIDESHOW_DEBUG_JSON_MAX);
      console.log("[slideshow-gen-debug] 2_parsed_after_json_parse", {
        slug: template.slug,
        attempt,
        parse_yielded_null: parsed == null,
        parsed_typeof: parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed,
        truncated: parsedLog.truncated,
        parsed_json: parsedLog.text,
      });

      const preShape = summarizeSlideshowValidationInput(parsed);
      console.log("[slideshow-gen-debug] 3_pre_validation_input_shape", {
        slug: template.slug,
        attempt,
        ...preShape,
      });

      const sc = Number((parsed as Record<string, unknown> | null)?.slide_count);
      const ladderForCount =
        sc === 3 || sc === 4 || sc === 5
          ? [...SLIDESHOW_ROLE_LADDERS[sc]]
          : null;
      console.log("[slideshow-gen-debug] 4_role_ladder_enforced_by_validator", {
        slug: template.slug,
        attempt,
        allowed_roles_by_slide_count: {
          3: [...SLIDESHOW_ROLE_LADDERS[3]],
          4: [...SLIDESHOW_ROLE_LADDERS[4]],
          5: [...SLIDESHOW_ROLE_LADDERS[5]],
        },
        expected_role_order_for_this_slide_count: ladderForCount,
        note: "Each slide i must have role exactly equal to expected_role_order_for_this_slide_count[i] after lowercasing and spaces→underscores.",
      });

      const validated = validateSlideshowLlmOutput(
        parsed,
        template.slideshow_config
      );

      if (!validated.ok) {
        previousFailure = validated.failureRule;
        console.error("[slideshow-gen] validation failed", {
          slug: template.slug,
          attempt,
          failureRule: validated.failureRule,
        });
        continue;
      }

      payload = validated.value;
      break;
    }

    if (!payload) {
      console.error("[slideshow-gen] skipped template after retries", template.slug);
      continue;
    }

    const ideaGroupId = randomUUID();
    const title = payload.slideshow_intent.slice(0, TITLE_MAX_CHARS);
    const style = buildStyle(template.slideshow_config);
    const slideMeta: SlideshowVariantMetadata["slides"] = [];
    let firstPublicUrl: string | null = null;
    const usedSlideshowAssetIds = new Set<string>();
    let firstSlideSanitizedText = title;

    try {
      for (let si = 0; si < payload.slides.length; si++) {
        const slide = payload.slides[si];
        const slideDisplayText = normalizeFinalMemeText(slide.text) ?? "";
        if (si === 0) {
          firstSlideSanitizedText =
            slideDisplayText.trim() !== "" ? slideDisplayText : title;
        }
        const asset = resolveSlideAsset(
          slide.image_selection,
          slide.layout_variant,
          assets,
          usedSlideshowAssetIds
        );
        if (!asset) {
          throw new Error("no_asset_for_slide");
        }
        usedSlideshowAssetIds.add(asset.id);

        const bg = await downloadAssetBuffer({
          admin: adminSupabase,
          asset,
          bucket: slideshowAssetsBucket,
        });

        const png = await renderVerticalSlideshowSlidePng({
          backgroundBuffer: bg,
          text: slideDisplayText,
          layout_variant: slide.layout_variant,
          style,
        });

        const objectPath = `generated_memes/${storageNamespace}/${template.template_id}/slideshow/${ideaGroupId}/slide-${si + 1}.png`;
        const { error: upErr } = await adminSupabase.storage
          .from(generatedMemeBucket)
          .upload(objectPath, png, {
            contentType: "image/png",
            upsert: true,
          });
        if (upErr) throw new Error(upErr.message);

        const pub = adminSupabase.storage
          .from(generatedMemeBucket)
          .getPublicUrl(objectPath);
        const url = pub.data.publicUrl ?? null;
        if (si === 0) firstPublicUrl = url;

        slideMeta.push({
          index: si,
          role: slide.role,
          text: slideDisplayText,
          layout_variant: slide.layout_variant,
          image_asset_id: asset.id,
          image_storage_path: asset.storage_path,
          image_url: url ?? "",
          image_selection: slide.image_selection,
        });
      }
    } catch (e) {
      console.error("[slideshow-gen] render/upload failed", {
        template: template.slug,
        message: e instanceof Error ? e.message : e,
      });
      continue;
    }

    const variantMetadata: SlideshowVariantMetadata = {
      media_type: "slideshow",
      output_format: "vertical_slideshow",
      slide_count: payload.slide_count,
      slideshow_intent: payload.slideshow_intent,
      slides: slideMeta,
    };

    const contentPackMeta =
      options?.contentPack && options?.generationRunIdOverride
        ? {
            content_pack: true as const,
            content_pack_batch: options.contentPack.batch,
            content_pack_run_id: options.generationRunIdOverride,
          }
        : null;

    const row = {
      user_id: user?.id ?? null,
      template_id: template.template_id,
      idea_group_id: ideaGroupId,
      title,
      format: template.template_name,
      top_text: firstSlideSanitizedText,
      bottom_text: null as string | null,
      post_caption: null,
      image_url: firstPublicUrl,
      variant_type: variantType,
      generation_run_id: generationRunId,
      batch_number: batchNumber,
      variant_metadata: {
        ...variantMetadata,
        selected_template_slug: template.slug,
        selected_template_id: template.template_id,
        selection_strategy: "random_template",
        workflow_mode: "single_output",
        ...cycleDiagnostics,
        requested_output_format: "vertical_slideshow",
        ...(contentPackMeta ?? {}),
        ...(options?.workspaceContext?.workspaceId
          ? { workspace_id: options.workspaceContext.workspaceId }
          : {}),
      },
    };

    const writeClient = user ? supabase : adminSupabase;
    const { error: insErr } = await writeClient.from("generated_memes").insert(row);
    if (insErr) {
      console.error("[slideshow-gen] insert failed", insErr);
      continue;
    }
    inserted++;
  }

  if (inserted === 0) {
    return { error: "Failed to generate slideshows. Check server logs." };
  }
  return { error: null };
}
