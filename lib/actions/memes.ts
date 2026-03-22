"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/actions/profile";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { renderMemePNGFromTemplate } from "@/renderer/renderMemeTemplate";
import { renderMemeMP4FromTemplate } from "@/renderer/renderMemeVideoTemplate";
import { getActiveImportantDay } from "@/lib/memes/variants/get-active-important-day";
import { runVerticalSlideshowGeneration } from "@/lib/memes/slideshow/generate-vertical-slideshow";

export async function generateMockMemes(
  promotionContext?: string,
  options?: {
    limit?: number;
    excludeExistingUserTemplates?: boolean;
    forcedTemplateId?: string;
    forceStandardVariant?: boolean;
    outputFormat?: "square_image" | "square_video" | "vertical_slideshow";
  }
): Promise<{ error: string | null }> {
  try {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const profile = await getProfile();
  if (!profile) {
    return { error: "Missing profile. Please complete onboarding again." };
  }

  const PROMOTION_MAX_CHARS = 280;
  const POST_CAPTION_MAX_CHARS = 220;
  const TITLE_MAX_CHARS = 45;
  const INITIAL_TEMPLATE_BATCH_SIZE = 3;
  const ORDERED_TEMPLATE_SLUG_POOL = [
    "victorian-nobody-me",
    "drake",
    "woman-yelling-cat",
    "green-mile-tired-boss",
    "two-buttons",
    "disaster-girl",
    "leo-cheers",
    "pov-anne-hathaway",
    "this-is-fine",
    "surprised-pikachu",
    "man-standing-up",
    "need-my-fix",
    "beetlejuice-surprised",
  ] as const;

  type PromoMode = "none" | "light" | "direct";
  type AssignedVariant = "standard" | "promo" | "important_day";
  type TemplateVariantAssignment = {
    template_id: string;
    slug: string;
    variantType: AssignedVariant;
  };
  type VariantContext = {
    variantType: AssignedVariant;
    promoText?: string | null;
    importantDayKey?: string | null;
    importantDayLabel?: string | null;
    importantDayPromptContext?: string | null;
  };
  type TemplateType =
    | "top_caption"
    | "side_caption"
    | "overlay"
    | "sign_caption";

  const normalizePromotionContext = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const collapsed = value.replace(/\s+/g, " ").trim();
    if (!collapsed) return null;
    return collapsed.slice(0, PROMOTION_MAX_CHARS).trim() || null;
  };

  const isDirectFriendlyPromoText = (promoText: string): boolean => {
    const normalized = promoText.toLowerCase().trim();
    const words = normalized.split(/\s+/).filter(Boolean);

    if (words.length === 0 || words.length > 8) {
      return false;
    }

    return [
      /\bno win no fee\b/,
      /\bfree consultation\b/,
      /\bbuy one get one\b/,
      /\bbogo\b/,
      /\bno obligation\b/,
      /\b\d{1,3}%\s*off\b/,
      /\bfree\b.*\b(consultation|quote|review|trial)\b/,
      /\b(offer|sale|discount|deal)\b/,
    ].some((pattern) => pattern.test(normalized));
  };

  const promotion = normalizePromotionContext(promotionContext);
  const batchSize = options?.limit ?? INITIAL_TEMPLATE_BATCH_SIZE;
  const outputFormat = options?.outputFormat ?? "square_image";
  const targetAssetType = outputFormat === "square_video" ? "video" : "image";
  const forcedTemplateId = String(options?.forcedTemplateId ?? "").trim() || null;
  const forceStandardVariant = Boolean(options?.forceStandardVariant);
  const isTemplateRegeneration = Boolean(forcedTemplateId);
  const generationRunId = randomUUID();
  const batchNumber = 1;
  const activeImportantDay = getActiveImportantDay();

  console.log("[important-day] activeImportantDay", activeImportantDay);

  const generationContext = {
    promotion,
    batchSize,
    generationRunId,
    batchNumber,
    activeImportantDay,
  };

  console.log("[meme-gen] Generation start", {
    hasPromotion: Boolean(generationContext.promotion),
    outputFormat,
    targetAssetType,
    promotionLength: generationContext.promotion?.length ?? 0,
    batchSize: generationContext.batchSize,
    generationRunId: generationContext.generationRunId,
    batchNumber: generationContext.batchNumber,
    excludeExistingUserTemplates: Boolean(options?.excludeExistingUserTemplates),
    forcedTemplateId,
    forceStandardVariant,
    isTemplateRegeneration,
    activeImportantDay: generationContext.activeImportantDay,
  });

  const { error: generatedMemesSchemaError } = await supabase
    .from("generated_memes")
    .select(
      "id, template_id, idea_group_id, variant_type, generation_run_id, batch_number, variant_metadata, post_caption"
    )
    .limit(1);

  if (generatedMemesSchemaError) {
    console.error("[meme-gen] generated_memes schema check failed", {
      generatedMemesSchemaError,
      expectedColumns: [
        "idea_group_id",
        "variant_type",
        "generation_run_id",
        "batch_number",
        "variant_metadata",
        "post_caption",
      ],
      generationRunId: generationContext.generationRunId,
    });
    return { error: "Failed to generate memes. Check server logs for details." };
  }

  // Keep the promo heuristic explicit and boring so it's easy to tune.
  const derivePromoMode = (template: {
    promotion_fit: string;
  }): PromoMode => {
    if (!promotion) return "none";

    const fit = template.promotion_fit.toLowerCase();

    const noneSignals = [
      "avoid",
      "bad fit",
      "poor fit",
      "not fit",
      "not a fit",
      "not ideal",
      "doesn't fit",
      "does not fit",
      "weak fit",
      "no promo",
      "ignore promo",
      "general only",
      "brand only",
    ];
    if (noneSignals.some((signal) => fit.includes(signal))) {
      return "none";
    }

    const directSignals = [
      "promotion",
      "promo",
      "deal",
      "offer",
      "sale",
      "discount",
      "launch",
      "announcement",
      "cta",
      "call to action",
      "pricing",
      "product drop",
    ];
    if (directSignals.some((signal) => fit.includes(signal))) {
      return "direct";
    }

    const lightSignals = [
      "light",
      "subtle",
      "soft",
      "indirect",
      "contextual",
      "timing",
      "emotion",
      "reaction",
      "vibe",
      "hint",
    ];
    if (lightSignals.some((signal) => fit.includes(signal))) {
      return isDirectFriendlyPromoText(promotion) ? "direct" : "light";
    }

    if (isDirectFriendlyPromoText(promotion)) {
      return "direct";
    }

    return "light";
  };

  const normalizeTemplateType = (value: unknown): TemplateType => {
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase();
    if (
      normalized === "top_caption" ||
      normalized === "side_caption" ||
      normalized === "overlay" ||
      normalized === "sign_caption"
    ) {
      return normalized;
    }
    return "top_caption";
  };

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[meme-gen] Missing SUPABASE_SERVICE_ROLE_KEY");
    return { error: "Server misconfiguration (templates access)." };
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("[meme-gen] Missing OPENAI_API_KEY");
    return { error: "Server misconfiguration (OpenAI key)." };
  }

  const adminSupabase = createSupabaseAdminClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  if (outputFormat === "vertical_slideshow") {
    return runVerticalSlideshowGeneration({
      supabase,
      adminSupabase,
      user,
      profile,
      promotionContext,
      options,
    });
  }

  const { data: templatesRaw, error: templatesError } = await adminSupabase
    .from("meme_templates")
    .select("*");

  if (templatesError) {
    console.error("[meme-gen] Failed to fetch meme_templates", templatesError);
    return { error: templatesError.message || "Failed to load templates." };
  }

  const templates = (templatesRaw ?? []).filter(
    (t: any) => t && typeof t === "object"
  );

  const isActive = (t: any): boolean => {
    if (typeof t.is_active === "boolean") return t.is_active;
    if (typeof t.active === "boolean") return t.active;
    if (typeof t.status === "string") return t.status.toLowerCase() === "active";
    // If the template table doesn't have an explicit active flag, assume everything is active.
    return true;
  };

  const nonEmpty = (v: any): boolean =>
    v !== null && v !== undefined && String(v).trim().length > 0;

  const hasSlot3 = (t: any): boolean => {
    // We treat any evidence of a 3rd slot as incompatible with the current 1/2-slot schema.
    return (
      nonEmpty(t.slot_3_role) ||
      t.slot_3_max_chars != null ||
      t.slot_3_max_lines != null ||
      t.slot_3_x != null ||
      t.slot_3_y != null
    );
  };

  const hasSlot2 = (t: any): boolean => {
    return (
      nonEmpty(t.slot_2_role) ||
      t.slot_2_max_chars != null ||
      t.slot_2_max_lines != null ||
      t.slot_2_x != null ||
      t.slot_2_y != null
    );
  };

  const toInt = (v: any, fallback: number): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };

  const getEffectiveSlotMaxChars = (
    templateType: TemplateType,
    rawValue: any,
    fallback: number
  ): number => {
    const normalized = toInt(rawValue, fallback);

    // Practical MVP: give tight side-caption templates one extra character of
    // breathing room without loosening other template families.
    if (templateType === "side_caption" && normalized <= 16) {
      return 17;
    }

    return normalized;
  };

  const normalizeSingleLine = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const cleaned = v.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
    return cleaned || null;
  };

  const endsWithDanglingConnector = (text: string): boolean => {
    return /\b(the|a|an|for|on|in|to|of|with|when|where|why|then|if|while|because|before|after|into|from|at|by|and|or|but|so)\b$/i.test(
      text
    );
  };

  const looksIncompleteWomanYellingCaption = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return true;
    if (endsWithDanglingConnector(trimmed)) return true;
    return false;
  };

  const looksLikeShortLabel = (text: string): boolean => {
    const trimmed = text.trim();
    if (trimmed.length < 2) return false;
    if (!/[a-z0-9]/i.test(trimmed)) return false;
    if (endsWithDanglingConnector(trimmed)) return false;
    const words = trimmed.split(/\s+/).filter(Boolean);
    return words.length <= 5;
  };

  const looksLikeCutOffFragment = (
    text: string,
    maxChars: number,
    options?: { allowShortLabelMode?: boolean }
  ): { isFragment: boolean; bypassedRule: string | null } => {
    const trimmed = text.trim();
    if (!trimmed) return { isFragment: true, bypassedRule: null };

    // If it's right up against the character limit and doesn't end with punctuation,
    // it's a strong sign the model generated something too long and we *would have*
    // truncated it.
    const endsWithPunctuation = /[.!?]$/.test(trimmed);
    if (trimmed.length >= Math.max(10, maxChars - 2) && !endsWithPunctuation) {
      if (options?.allowShortLabelMode && looksLikeShortLabel(trimmed)) {
        return {
          isFragment: false,
          bypassedRule: "near_limit_no_punctuation_for_short_label",
        };
      }
      return { isFragment: true, bypassedRule: null };
    }

    // If it ends on a dangling preposition/conjunction, treat it like an incomplete fragment.
    if (endsWithDanglingConnector(trimmed)) {
      return { isFragment: true, bypassedRule: null };
    }

    // Avoid super-short outputs that are likely incomplete.
    if (trimmed.length < 4) {
      if (options?.allowShortLabelMode && looksLikeShortLabel(trimmed)) {
        return {
          isFragment: false,
          bypassedRule: "min_length_for_short_label",
        };
      }
      return { isFragment: true, bypassedRule: null };
    }

    return { isFragment: false, bypassedRule: null };
  };

  const validateTitle = (v: unknown): { value: string | null; failRule: string | null; length: number | null } => {
    const s = normalizeSingleLine(v);
    if (!s) return { value: null, failRule: "title_missing_or_invalid", length: null };
    if (s.length > TITLE_MAX_CHARS) {
      return { value: null, failRule: "title_too_long", length: s.length };
    }
    return { value: s, failRule: null, length: s.length };
  };

  const validatePostCaption = (
    v: unknown
  ): { value: string | null; failRule: string | null; length: number | null } => {
    if (typeof v !== "string") {
      return {
        value: null,
        failRule: "post_caption_missing_or_invalid",
        length: null,
      };
    }

    const cleaned = v
      .replace(/\r?\n/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .trim();

    if (!cleaned) {
      return {
        value: null,
        failRule: "post_caption_missing_or_invalid",
        length: null,
      };
    }

    if (cleaned.length > POST_CAPTION_MAX_CHARS) {
      return {
        value: null,
        failRule: "post_caption_too_long",
        length: cleaned.length,
      };
    }

    return { value: cleaned, failRule: null, length: cleaned.length };
  };

  const buildFallbackPostCaption = (params: {
    variantContext: VariantContext;
  }): string => {
    const { variantContext } = params;

    const fallback =
      variantContext.variantType === "important_day" && variantContext.importantDayLabel
        ? `A little too real for ${variantContext.importantDayLabel}.`
        : variantContext.variantType === "promo"
          ? "A little too real while this offer is live."
          : "A little too real not to post.";

    return fallback.slice(0, POST_CAPTION_MAX_CHARS).trim();
  };

  const validateSlotTextSingleLine = (
    v: unknown,
    maxChars: number,
    slotLabel: string,
    options?: {
      allowShortLabelMode?: boolean;
      templateSlug?: string;
      templateType?: TemplateType;
    }
  ): { value: string | null; failRule: string | null; length: number | null } => {
    const cleaned = normalizeSingleLine(v);
    if (!cleaned) return { value: null, failRule: `${slotLabel}_missing_or_invalid`, length: null };
    if (cleaned.length > maxChars) {
      return {
        value: null,
        failRule: `${slotLabel}_over_max_chars`,
        length: cleaned.length,
      };
    }
    if (options?.allowShortLabelMode && looksLikeShortLabel(cleaned)) {
      console.log("[meme-gen] Short label accepted without fragment penalty", {
        template: options?.templateSlug ?? null,
        templateType: options?.templateType ?? null,
        slotLabel,
        text: cleaned,
        maxChars,
      });
      return { value: cleaned, failRule: null, length: cleaned.length };
    }
    const fragmentCheck = looksLikeCutOffFragment(cleaned, maxChars, {
      allowShortLabelMode: options?.allowShortLabelMode,
    });
    if (fragmentCheck.bypassedRule) {
      console.log("[meme-gen] Fragment rule relaxed for short label", {
        template: options?.templateSlug ?? null,
        templateType: options?.templateType ?? null,
        slotLabel,
        bypassedRule: fragmentCheck.bypassedRule,
        text: cleaned,
        maxChars,
      });
    }
    if (fragmentCheck.isFragment) {
      return {
        value: null,
        failRule: `${slotLabel}_likely_fragment_cutoff`,
        length: cleaned.length,
      };
    }
    if (
      options?.templateSlug === "woman-yelling-cat" &&
      slotLabel === "slot_1" &&
      looksIncompleteWomanYellingCaption(cleaned)
    ) {
      return {
        value: null,
        failRule: `${slotLabel}_incomplete_reaction_caption`,
        length: cleaned.length,
      };
    }
    return { value: cleaned, failRule: null, length: cleaned.length };
  };

  const safeJsonParse = (content: string): unknown => {
    // response_format=json_object should be valid JSON, but keep parsing defensive.
    try {
      return JSON.parse(content);
    } catch {
      const firstBrace = content.indexOf("{");
      const lastBrace = content.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace)
        return null;
      const sliced = content.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        return null;
      }
    }
  };

  type CompatibleTemplate = {
    template_id: string;
    template_name: string;
    slug: string;
    template_type: TemplateType;
    asset_type: "image" | "video";
    media_format: string | null;
    template_logic: string;
    meme_mechanic: string;
    emotion_style: string;
    slot_1_role: string;
    slot_2_role: string | null;
    slot_3_role: string | null;
    slot_1_max_chars: number;
    slot_2_max_chars: number;
    slot_3_max_chars: number;
    slot_1_max_lines: number;
    slot_2_max_lines: number;
    slot_3_max_lines: number;
    context_fit: string;
    business_fit: string;
    promotion_fit: string;
    example_output: string;
    isTwoSlot: boolean;

    // Rendering metadata (MVP: 1-slot / 2-slot only)
    image_filename?: string | null;
    source_media_path?: string | null;
    preview_image_filename?: string | null;
    canvas_width: number;
    canvas_height: number;
    font?: string | null;
    font_size?: number | null;
    alignment?: string | null;
    text_color?: string | null;
    stroke_color?: string | null;
    stroke_width?: number | null;

    slot_1_x?: number | null;
    slot_1_y?: number | null;
    slot_1_width?: number | null;
    slot_1_height?: number | null;
    slot_2_x?: number | null;
    slot_2_y?: number | null;
    slot_2_width?: number | null;
    slot_2_height?: number | null;
  };

  const toNullableInt = (v: any): number | null => {
    if (v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
  };

  const getTemplateTypeWritingGuidance = (template: CompatibleTemplate): string => {
    switch (template.template_type) {
      case "side_caption":
        return `Template-type guidance: side_caption
- This template is not a normal top/bottom setup-punchline meme.
- Treat the slots like side-by-side options, comparisons, choices, labels, or contrasting reactions.
- Keep the slot phrasing parallel and scannable at a glance.
- Avoid writing one long setup in slot 1 and a separate punchline in slot 2 unless the slot roles explicitly call for that.`;
      case "overlay":
        return `Template-type guidance: overlay
- Text sits directly on the image, so readability is critical.
- Prefer fewer words, faster comprehension, and stronger immediate punch.
- Avoid dense wording, clause-heavy phrasing, or anything that needs explanation.
- If in doubt, make the text shorter and cleaner than a typical caption meme.`;
      case "sign_caption":
        return `Template-type guidance: sign_caption
- The main text should read naturally as something someone could hold up, point at, or present on a sign.
- Favor concise statements, opinions, requests, or pointed observations that feel believable in a sign area.
- Avoid generic top/bottom meme rhythm unless the template has a real second support slot.`;
      case "top_caption":
      default:
        return `Template-type guidance: top_caption
- Use standard caption-meme behavior.
- Slot 1 can carry the setup or primary caption idea.
- If there is a second slot, it can complete the contrast, payoff, or reaction naturally.`;
    }
  };

  const getSlotWritingGuidance = (template: CompatibleTemplate): string => {
    const slot1Role = template.slot_1_role || "slot_1";
    const slot2Role = template.slot_2_role || "slot_2";

    switch (template.template_type) {
      case "side_caption":
        return template.isTwoSlot
          ? `Slot behavior for side_caption:
Slot 1:
- role: ${slot1Role}
- Think short label, option, reaction, or comparison side A.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}

Slot 2:
- role: ${slot2Role}
- Think short label, option, reaction, or comparison side B.
- Keep it complementary or contrasting with Slot 1.
- max_chars: ${template.slot_2_max_chars}
- max_lines: ${template.slot_2_max_lines}`
          : `Slot behavior for side_caption:
Slot 1:
- role: ${slot1Role}
- Write a short comparison label, option, or reaction that works on its own.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}`;
      case "overlay":
        return template.isTwoSlot
          ? `Slot behavior for overlay:
Slot 1:
- role: ${slot1Role}
- Keep it extremely readable on-image.
- Prefer a short phrase, not a full explanatory sentence.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}

Slot 2:
- role: ${slot2Role}
- Also keep it short, punchy, and visually scannable.
- max_chars: ${template.slot_2_max_chars}
- max_lines: ${template.slot_2_max_lines}`
          : `Slot behavior for overlay:
Slot 1:
- role: ${slot1Role}
- Keep it extremely readable on-image.
- Prefer a short phrase, not a full explanatory sentence.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}`;
      case "sign_caption":
        return template.isTwoSlot
          ? `Slot behavior for sign_caption:
Slot 1:
- role: ${slot1Role}
- This should read naturally as sign text or the main displayed statement.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}

Slot 2:
- role: ${slot2Role}
- Only use this as supporting context or a natural secondary line if the template truly needs it.
- Do not turn it into a generic punchline by default.
- max_chars: ${template.slot_2_max_chars}
- max_lines: ${template.slot_2_max_lines}`
          : `Slot behavior for sign_caption:
Slot 1:
- role: ${slot1Role}
- This should read naturally as sign text or the main displayed statement.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}`;
      case "top_caption":
      default:
        return template.isTwoSlot
          ? `Slot behavior for top_caption:
Slot 1:
- role: ${slot1Role}
- Primary caption/setup.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}

Slot 2:
- role: ${slot2Role}
- Secondary caption/payoff/reaction when appropriate.
- max_chars: ${template.slot_2_max_chars}
- max_lines: ${template.slot_2_max_lines}`
          : `Slot behavior for top_caption:
Slot 1:
- role: ${slot1Role}
- Primary caption/setup.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}`;
    }
  };

  const getMemeMechanicGuidance = (template: CompatibleTemplate): string => {
    switch (template.meme_mechanic) {
      case "reject_vs_prefer":
        return `Meme-mechanic guidance: reject_vs_prefer
- Slot 1 must clearly feel like the worse, rejected, annoying, outdated, or less satisfying option.
- Slot 2 must clearly feel like the better, preferred, smarter, cleaner, or more satisfying option.
- The contrast should be directional and obvious immediately.
- Keep both slots short, parallel, and easy to compare at a glance.
- Avoid generic labels that do not create a strong before-vs-after or bad-vs-better contrast.
- Prefer concrete behaviors, tools, workflows, or situations over abstract business nouns.`;
      case "difficult_choice":
        return `Meme-mechanic guidance: difficult_choice
- Slot 1 and Slot 2 must both be plausible competing choices.
- The conflict should feel immediate: both options should pull against each other in a believable way.
- Make the dilemma obvious from the labels alone.
- Keep both slots short, parallel, and equally plausible.
- Avoid weak pairings that do not feel like a real stressful choice.`;
      default:
        return "";
    }
  };

  const getTemplateSpecificGuidance = (template: CompatibleTemplate): string => {
    if (template.slug === "drake") {
      return `Template-specific guidance: drake
- Write this like an instantly recognizable Drake reject-vs-prefer contrast.
- Slot 1 should feel visibly worse: messy, outdated, frustrating, manual, awkward, or low-status.
- Slot 2 should feel visibly better: cleaner, smarter, easier, faster, or more satisfying.
- Use concrete wording, not abstract labels. Avoid vague terms like "solutions", "insights", "informed", "strategy", or "innovation".
- Favor direct contrasts that a person can picture immediately.
- Keep both labels parallel, but allow slightly fuller wording when it improves clarity.
- Short phrase labels are better than single-word labels here.`;
    }

    if (template.slug === "two-buttons") {
      return `Template-specific guidance: two-buttons
- Write this like a real impossible choice between two competing options.
- Each slot must be a short, complete choice label, not a sentence fragment.
- Both choices should feel plausible and in tension with each other immediately.
- Avoid vague abstractions or labels that do not create a real dilemma.
- Keep both options parallel and compact, but allow slightly fuller wording when it makes the dilemma clearer.
- A concise natural phrase is better than an overly compressed label.`;
    }

    return "";
  };

  const getRetryCorrectiveGuidance = (
    template: CompatibleTemplate,
    previousFailureRule: string | null
  ): string => {
    if (!previousFailureRule) return "";

    const getSlotMaxCharsForRule = (rule: string): number | null => {
      if (rule.startsWith("slot_1_")) return template.slot_1_max_chars;
      if (rule.startsWith("slot_2_")) return template.slot_2_max_chars;
      return null;
    };

    const getSlotLabelForRule = (rule: string): string | null => {
      if (rule.startsWith("slot_1_")) return "top_text";
      if (rule.startsWith("slot_2_")) return "bottom_text";
      return null;
    };

    const getTemplateTypeRetryShape = (): string => {
      switch (template.template_type) {
        case "side_caption":
          return `- Keep each slot as a compact, complete label or very short phrase.
- Do not write sentence-style captions in either slot.
- Make the two slots parallel and instantly scannable.`;
        case "overlay":
          return `- Keep the wording visually readable on-image.
- Prefer fewer words and faster comprehension.`;
        case "sign_caption":
          return `- Make the main text read naturally like sign text or a displayed statement.
- Keep the supporting text minimal if a second slot is present.`;
        case "top_caption":
        default:
          return `- Keep the caption punchy, complete, and natural for this template.`;
      }
    };

    const slotLabel = getSlotLabelForRule(previousFailureRule);
    const slotMaxChars = getSlotMaxCharsForRule(previousFailureRule);

    if (previousFailureRule === "json_parse_failed") {
      return `Retry correction:
- The previous response was not valid JSON.
- Return ONLY valid JSON with the exact required keys.
- Do not include any prose before or after the JSON object.`;
    }

    if (previousFailureRule === "one_slot_bottom_text_not_null") {
      return `Retry correction:
- This template only supports one text slot.
- bottom_text MUST be null.
- Put the full meme idea into top_text only.`;
    }

    if (previousFailureRule === "title_missing_or_invalid") {
      return `Retry correction:
- The title was missing or invalid.
- Return a short, clean meme title in plain text.
- Keep the title concise and under ${TITLE_MAX_CHARS} characters.`;
    }

    if (previousFailureRule === "title_too_long") {
      return `Retry correction:
- The title was too long.
- Rewrite the title shorter and simpler.
- Keep the title under ${TITLE_MAX_CHARS} characters.`;
    }

    if (previousFailureRule.endsWith("_missing_or_invalid") && slotLabel && slotMaxChars) {
      return `Retry correction:
- ${slotLabel} was missing or invalid.
- Provide a complete single-line value for ${slotLabel}.
- Keep it under ${slotMaxChars} characters.
${getTemplateTypeRetryShape()}`;
    }

    if (previousFailureRule.endsWith("_over_max_chars") && slotLabel && slotMaxChars) {
      return `Retry correction:
- The previous ${slotLabel} exceeded the character limit.
- Rewrite ${slotLabel} shorter without changing the core joke.
- Keep ${slotLabel} at or under ${slotMaxChars} characters.
- Remove filler words and choose simpler phrasing.
${getTemplateTypeRetryShape()}`;
    }

    if (
      previousFailureRule.endsWith("_likely_fragment_cutoff") &&
      slotLabel &&
      slotMaxChars
    ) {
      return `Retry correction:
- The previous ${slotLabel} looked cut off or incomplete.
- Rewrite it as one complete, finishable phrase.
- Do not end on open connectors like "and", "but", "so", "for", or "with".
- Keep ${slotLabel} under ${slotMaxChars} characters while still sounding complete.
${getTemplateTypeRetryShape()}`;
    }

    return `Retry correction:
- The previous attempt failed validation for this exact reason: ${previousFailureRule}.
- Rewrite more conservatively and keep every field fully valid.
- Make the output shorter, cleaner, and more complete than the last attempt.`;
  };

  const isUltraTightTemplate = (template: CompatibleTemplate): boolean => {
    if (template.template_type === "side_caption") {
      if (template.isTwoSlot) {
        return template.slot_1_max_chars <= 17 && template.slot_2_max_chars <= 17;
      }
      return template.slot_1_max_chars <= 17;
    }

    if (template.isTwoSlot) {
      return template.slot_1_max_chars <= 16 && template.slot_2_max_chars <= 16;
    }
    return template.slot_1_max_chars <= 16;
  };

  const getUltraTightPromptGuidance = (template: CompatibleTemplate): string => {
    if (!isUltraTightTemplate(template)) return "";

    if (template.template_type === "side_caption") {
      return `Ultra-tight template mode:
- This template is extremely space-constrained.
- Prefer 2-4 word labels or very short phrases, not long sentence-like captions.
- Aim comfortably under the max chars for each slot rather than writing up to the limit.
- Remove filler words, articles, and extra connective phrasing unless they are essential.
- For side-by-side contrast, make Slot 1 and Slot 2 feel parallel and instantly scannable.
- Think compressed option labels, reaction labels, or comparison shorthand.`;
    }

    return `Ultra-tight template mode:
- This template is extremely space-constrained.
- Prefer 1-3 word phrases whenever possible.
- Aim comfortably under the max chars for each slot rather than writing up to the limit.
- Use label-style wording over sentence-style wording.
- Remove filler words and unnecessary setup.`;
  };

  const allowShortLabelValidationMode = (
    template: CompatibleTemplate
  ): boolean => {
    return template.template_type === "side_caption" && isUltraTightTemplate(template);
  };

  const getIdealSlotTargets = (
    template: CompatibleTemplate,
    attempt: number
  ): { topIdeal: number; bottomIdeal: number } => {
    if (template.slug === "drake" || template.slug === "two-buttons") {
      return {
        topIdeal: Math.max(10, Math.floor(template.slot_1_max_chars * (attempt >= 2 ? 0.94 : 1))),
        bottomIdeal: Math.max(
          10,
          Math.floor(template.slot_2_max_chars * (attempt >= 2 ? 0.94 : 1))
        ),
      };
    }

    if (template.slug === "woman-yelling-cat") {
      return {
        topIdeal: Math.max(
          24,
          Math.floor(template.slot_1_max_chars * (attempt >= 2 ? 0.98 : 1))
        ),
        bottomIdeal: Math.max(
          8,
          Math.floor(template.slot_2_max_chars * (attempt >= 2 ? 0.8 : 0.95))
        ),
      };
    }

    return {
      topIdeal: Math.max(
        8,
        Math.floor(template.slot_1_max_chars * (attempt >= 2 ? 0.8 : 0.95))
      ),
      bottomIdeal: Math.max(
        8,
        Math.floor(template.slot_2_max_chars * (attempt >= 2 ? 0.8 : 0.95))
      ),
    };
  };

  const loadCompatibleTemplates = (rows: any[]): CompatibleTemplate[] => {
    return rows
      .filter((t: any) => isActive(t))
      .filter((t: any) => {
        const family = String(t.template_family ?? "square_meme").trim();
        if (family === "vertical_slideshow") return false;
        return true;
      })
      .filter((t: any) => {
        const assetType = String(t.asset_type ?? "image").trim().toLowerCase();
        return assetType === targetAssetType;
      })
      .filter((t: any) => {
        const slug = String(t.slug ?? "").trim().toLowerCase();
        if (slug === "distracted-boyfriend") return true;
        return !hasSlot3(t);
      })
      .map((t: any) => {
        const template_id = String(
          t.template_id ?? t.id ?? t.slug ?? ""
        ).trim();
        const templateType = normalizeTemplateType(
          t.text_layout_type ?? t.template_type
        );
        return {
          template_id,
          template_name: String(t.template_name ?? t.name ?? "").trim(),
          slug: String(t.slug ?? "").trim(),
          template_type: templateType,
          asset_type:
            String(t.asset_type ?? "image").trim().toLowerCase() === "video"
              ? "video"
              : "image",
          media_format: t.media_format ? String(t.media_format).trim().toLowerCase() : null,
          template_logic: String(t.template_logic ?? "").trim(),
          meme_mechanic: String(t.meme_mechanic ?? "").trim(),
          emotion_style: String(t.emotion_style ?? "").trim(),
          slot_1_role: String(t.slot_1_role ?? "").trim(),
          slot_2_role: t.slot_2_role ? String(t.slot_2_role).trim() : null,
          slot_3_role: t.slot_3_role ? String(t.slot_3_role).trim() : null,
          slot_1_max_chars: getEffectiveSlotMaxChars(
            templateType,
            t.slot_1_max_chars,
            60
          ),
          slot_2_max_chars: getEffectiveSlotMaxChars(
            templateType,
            t.slot_2_max_chars,
            60
          ),
          slot_3_max_chars: toInt(t.slot_3_max_chars, 60),
          slot_1_max_lines: toInt(t.slot_1_max_lines, 2),
          slot_2_max_lines: toInt(t.slot_2_max_lines, 2),
          slot_3_max_lines: toInt(t.slot_3_max_lines, 2),
          context_fit: String(t.context_fit ?? "").trim(),
          business_fit: String(t.business_fit ?? "").trim(),
          promotion_fit: String(t.promotion_fit ?? "").trim(),
          example_output: String(t.example_output ?? "").trim(),
          isTwoSlot: hasSlot2(t),
          image_filename: t.image_filename ? String(t.image_filename).trim() : null,
          source_media_path: t.source_media_path
            ? String(t.source_media_path).trim()
            : null,
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
        } satisfies CompatibleTemplate;
      })
      .filter((t) => t.template_id && t.template_name && t.slug && t.slot_1_role);
  };

  const buildOrderedTemplatePool = (
    templates: CompatibleTemplate[],
    excludedTemplateIds: Set<string>
  ): CompatibleTemplate[] => {
    const slugOrder = new Map<string, number>(
      ORDERED_TEMPLATE_SLUG_POOL.map((slug, index) => [slug, index])
    );

    return [...templates]
      .filter((template) => !excludedTemplateIds.has(template.template_id))
      .sort((a, b) => {
        const aIndex = slugOrder.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
        const bIndex = slugOrder.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return a.slug.localeCompare(b.slug);
      });
  };

  const compatibleTemplates = loadCompatibleTemplates(templates);

  if (compatibleTemplates.length === 0) {
    console.error("[meme-gen] No compatible templates found after filtering.");
    return {
      error:
        outputFormat === "square_video"
          ? "No active square video templates found."
          : "No compatible meme templates found.",
    };
  }

  const excludedTemplateIds = new Set<string>();
  if (options?.excludeExistingUserTemplates) {
    const { data: existingRows, error: existingRowsError } = await supabase
      .from("generated_memes")
      .select("template_id")
      .eq("user_id", user.id)
      .not("template_id", "is", null);

    if (existingRowsError) {
      console.error("[meme-gen] Failed to load existing generated_memes", {
        existingRowsError,
      });
      return { error: existingRowsError.message || "Failed to load existing memes." };
    }

    for (const row of existingRows ?? []) {
      const templateId = String((row as any).template_id ?? "").trim();
      if (templateId) excludedTemplateIds.add(templateId);
    }
  }

  const attemptedTemplateIds = new Set<string>(excludedTemplateIds);
  const orderedTemplatePool = forcedTemplateId
    ? compatibleTemplates.filter(
        (template) =>
          template.template_id === forcedTemplateId || template.slug === forcedTemplateId
      )
    : buildOrderedTemplatePool(compatibleTemplates, attemptedTemplateIds);

  console.log("[meme-gen] Excluded template ids", {
    excludeExistingUserTemplates: Boolean(options?.excludeExistingUserTemplates),
    excludedCount: excludedTemplateIds.size,
    excludedTemplateIds: [...excludedTemplateIds],
  });

  console.log(
    "[meme-gen] Ordered template pool",
    orderedTemplatePool.map((template, index) => ({
      poolIndex: index + 1,
      template: template.slug,
      template_id: template.template_id,
      template_type: template.template_type,
      meme_mechanic: template.meme_mechanic || null,
      emotion_style: template.emotion_style || null,
    }))
  );

  if (orderedTemplatePool.length === 0) {
    return {
      error: forcedTemplateId
        ? "Template not found for regeneration."
        : "No unused templates remain to generate.",
    };
  }

  const selectedTemplatesForBatch = orderedTemplatePool.slice(0, batchSize);
  const getPromoSuitabilityScore = (template: CompatibleTemplate): number => {
    const fit = template.promotion_fit.toLowerCase().trim();
    if (!fit) return 0;

    const noneSignals = [
      "avoid",
      "bad fit",
      "poor fit",
      "not fit",
      "not a fit",
      "not ideal",
      "doesn't fit",
      "does not fit",
      "weak fit",
      "no promo",
      "ignore promo",
      "general only",
      "brand only",
    ];
    if (noneSignals.some((signal) => fit.includes(signal))) {
      return -100;
    }

    let score = 0;

    const directSignals = [
      "promotion",
      "promo",
      "deal",
      "offer",
      "sale",
      "discount",
      "launch",
      "announcement",
      "cta",
      "call to action",
      "pricing",
      "product drop",
    ];
    for (const signal of directSignals) {
      if (fit.includes(signal)) score += 3;
    }

    const lightSignals = [
      "light",
      "subtle",
      "soft",
      "indirect",
      "contextual",
      "timing",
      "emotion",
      "reaction",
      "vibe",
      "hint",
    ];
    for (const signal of lightSignals) {
      if (fit.includes(signal)) score += 1;
    }

    return score;
  };

  const assignedVariants = new Array<AssignedVariant>(
    selectedTemplatesForBatch.length
  ).fill("standard");

  let promoTemplateIndex: number | null = null;
  if (
    !forceStandardVariant &&
    generationContext.promotion &&
    selectedTemplatesForBatch.length > 0
  ) {
    promoTemplateIndex = selectedTemplatesForBatch.reduce(
      (bestIndex, template, index, templates) => {
        if (bestIndex === null) return index;

        const bestScore = getPromoSuitabilityScore(templates[bestIndex]);
        const currentScore = getPromoSuitabilityScore(template);

        if (currentScore > bestScore) return index;
        return bestIndex;
      },
      null as number | null
    );

    if (promoTemplateIndex !== null) {
      assignedVariants[promoTemplateIndex] = "promo";
    }
  }

  let importantDayTemplateIndex: number | null = null;
  if (
    !forceStandardVariant &&
    generationContext.activeImportantDay &&
    selectedTemplatesForBatch.length > 0
  ) {
    importantDayTemplateIndex = selectedTemplatesForBatch.findIndex(
      (_template, index) => index !== promoTemplateIndex
    );

    if (importantDayTemplateIndex !== -1) {
      assignedVariants[importantDayTemplateIndex] = "important_day";
    } else if (promoTemplateIndex === null && selectedTemplatesForBatch.length > 0) {
      assignedVariants[0] = "important_day";
      importantDayTemplateIndex = 0;
    } else {
      importantDayTemplateIndex = null;
    }
  }

  const templateVariantAssignments: TemplateVariantAssignment[] =
    selectedTemplatesForBatch.map((template, index) => ({
      template_id: template.template_id,
      slug: template.slug,
      variantType: assignedVariants[index] ?? "standard",
    }));

  console.log(
    "[variant-assignment] templateVariantAssignments",
    templateVariantAssignments
  );

  console.log("[meme-gen] Selected templates for batch", {
    generationRunId: generationContext.generationRunId,
    selectedTemplates: selectedTemplatesForBatch.map((template, index) => ({
      selectionIndex: index + 1,
      template_id: template.template_id,
      slug: template.slug,
      templateType: template.template_type,
      promoSuitabilityScore: getPromoSuitabilityScore(template),
      assignedVariant:
        templateVariantAssignments[index]?.variantType ?? "standard",
    })),
    promoTemplateIndex,
    importantDayTemplateIndex,
  });

  const apiKey = process.env.OPENAI_API_KEY as string;
  const memeTemplatesBucket =
    process.env.MEME_TEMPLATES_BUCKET ?? "meme-templates";
  const generatedMemeBucket =
    process.env.MEME_GENERATED_MEMES_BUCKET ?? "generated-memes";

  console.log("[meme-gen] Starting generation loop", {
    generationRunId: generationContext.generationRunId,
    orderedTemplatePoolSize: orderedTemplatePool.length,
    targetInsertCount: batchSize,
    selectedTemplateCount: selectedTemplatesForBatch.length,
  });

  const generateForTemplate = async (
    template: CompatibleTemplate,
    variantContext: VariantContext,
    promoMode: PromoMode,
    attempt: number,
    previousFailureRule: string | null
  ): Promise<
    | {
        result: {
          title: string;
          top_text: string;
          bottom_text: string | null;
          slot_3_text: string | null;
          post_caption: string;
        };
        failureRule: null;
      }
    | { result: null; failureRule: string | null }
  > => {
    const brand_name = profile.brand_name ?? "";
    const what_you_do = profile.what_you_do ?? "";
    const audience = profile.audience ?? "";
    const country = profile.country ?? "";
    const ultraTightPromptMode = isUltraTightTemplate(template);
    const mechanicSpecificGuidance = getMemeMechanicGuidance(template);
    const templateSpecificGuidance = getTemplateSpecificGuidance(template);
    const retryCorrectiveGuidance = getRetryCorrectiveGuidance(
      template,
      previousFailureRule
    );
    const variantPromptGuidance =
      variantContext.variantType === "promo"
        ? `Variant guidance:
- This is the promo version.
- Naturally incorporate the user promotion when it fits the meme.
- Keep it meme-first, not ad-first.
- Avoid banner, headline, or campaign-style copy.`
        : variantContext.variantType === "important_day"
          ? `IMPORTANT DAY CONTEXT
- occasion_label: ${variantContext.importantDayLabel ?? "Unknown"}
- seasonal_behaviours_and_tensions: ${variantContext.importantDayPromptContext ?? "None"}

IMPORTANT DAY WRITING RULES
- Build the joke around the seasonal behaviours, emotions, pressure, routines, or chaos created by this occasion.
- The meme should feel timely and recognisable for this period.
- The reference may be explicit or implicit.
- Prioritise relatability and humour over directly naming the occasion.
- Use the important day as context, not as a slogan.
- Do not sound like a greeting card, seasonal campaign, or ad.
- Keep it meme-first and template-compatible.
- This variant should feel meaningfully more timely than the default version.`
          : `Variant guidance:
- This is the default version.
- Do not reference promotions.
- Do not reference holidays, seasons, or special events.`;

    if (variantContext.variantType === "important_day") {
      console.log("[important-day-prompt-block]", {
        slug: template.slug,
        importantDayPromptBlock: variantPromptGuidance,
      });
    }

    const { topIdeal, bottomIdeal } = getIdealSlotTargets(template, attempt);
    const isThreeSlot = !!template.slot_3_role;

    const promoModeInstructions =
      variantContext.variantType !== "promo"
        ? `Promo mode: none
- Ignore the promotion entirely for this template.
- Make the meme about the brand/audience context only.`
        : promoMode === "direct"
        ? `Promo mode: direct
- This is a direct promo-capable variant.
- If the promotion fits naturally, keep the offer wording recognisable.
- Prefer the exact phrase or a very tight faithful rendering when possible.
- Do not dilute the offer into a vague broader idea.
- The joke must still work first, not the ad message.
- Do not sound like a banner headline, ad slogan, or campaign copy.
- If the exact wording becomes clunky or breaks the meme, omit it rather than distorting it inaccurately.`
        : promoMode === "light"
          ? `Promo mode: light
- Use the promotion only as soft context.
- Prefer the feeling, situation, urgency, timing, or audience reaction around the promotion rather than explicit ad copy.
- A light reference is optional; if it weakens the joke, keep the meme broader.
- Do not restate the offer mechanically.`
          : `Promo mode: none
- Ignore the promotion entirely for this template.
- Make the meme about the brand/audience context only.`;

    if (variantContext.variantType === "promo") {
      console.log("[promo-prompt-block]", {
        slug: template.slug,
        promoMode,
        promoModeInstructions,
      });
    }

    const prompt = `You generate brand-safe meme captions that follow a specific template.

Hard constraints (must obey):
- top_text MUST be <= ${template.slot_1_max_chars} characters and be a complete, finishable phrase (no mid-word cut-offs).
- If the phrase would exceed the limit, rewrite it shorter and simpler. Never output an incomplete fragment.
- top_text should ideally be <= ${topIdeal} characters.
- bottom_text MUST be <= ${template.slot_2_max_chars} characters when present, and be complete. If it would exceed the limit, rewrite shorter and simpler.
- bottom_text should ideally be <= ${bottomIdeal} characters when present.
- post_caption MUST be <= ${POST_CAPTION_MAX_CHARS} characters and easy to post as-is.
- Do not include markdown, HTML, code blocks, or newline characters.

Brand context:
- brand_name: ${brand_name}
- what_you_do: ${what_you_do}
- audience: ${audience}
- country: ${country}

Promotion context:
- normalized_promotion: ${variantContext.promoText ?? "None"}
- promo_mode: ${variantContext.variantType === "promo" ? promoMode : "none"}

Important day context:
- active_important_day_key: ${variantContext.importantDayKey ?? "None"}
- active_important_day_label: ${variantContext.importantDayLabel ?? "None"}
- active_important_day_prompt_context: ${variantContext.importantDayPromptContext ?? "None"}

Template metadata:
- template_name: ${template.template_name}
- slug: ${template.slug}
- template_id: ${template.template_id}
- template_type: ${template.template_type}
- meme_mechanic: ${template.meme_mechanic}
- emotion_style: ${template.emotion_style}
- template_logic: ${template.template_logic}
- context_fit: ${template.context_fit}
- business_fit: ${template.business_fit}
- promotion_fit: ${template.promotion_fit}
- example_output: ${template.example_output}

${getTemplateTypeWritingGuidance(template)}

${getSlotWritingGuidance(template)}

${isThreeSlot
  ? `Three-slot output mapping:
- slot_1_role ("${template.slot_1_role}") -> slot_1_text
- slot_2_role ("${template.slot_2_role ?? "slot_2"}") -> slot_2_text
- slot_3_role ("${template.slot_3_role ?? "slot_3"}") -> slot_3_text
- Keep each slot value single-line and complete.
- Do not use markdown and do not include newline characters in any slot value.`
  : ""}

${mechanicSpecificGuidance}

${templateSpecificGuidance}

${getUltraTightPromptGuidance(template)}

${retryCorrectiveGuidance}

Rules:
- Make it punchy, internet-native, and useful for posting (optimize for shareability).
- Avoid bland, generic filler. Be specific to the brand + audience.
- Use the template_logic and meme_mechanic to choose the angle. emotion_style sets tone.
- Respect the template_type. Do not write every template like a generic top/bottom caption meme.
- Meme quality matters more than forcing the promotion into the caption.
- Never sound like a stiff ad, slogan, or generic marketing copy.
- If you reference the promotion, preserve exact facts from the promo context. Never invent or alter discount amounts, dates, pricing, or offer terms.
- If exact promo facts do not fit naturally or within the slot limits, leave them out rather than changing them.
- Do not include disallowed/unsafe content (hate, sexual, illegal, harassment, personal data).
- Never truncate mid-sentence: rewrite so it fits.
- Also generate a short social caption for the post.
- post_caption should complement the meme instead of repeating the on-image text exactly.
- Keep post_caption concise, natural, and easy to post.
- No surrounding quotation marks. Avoid heavy hashtag use.

${promoModeInstructions}

${variantPromptGuidance}

Return ONLY valid JSON with this exact shape:
${isThreeSlot
  ? `{
  "slot_1_text": string,
  "slot_2_text": string,
  "slot_3_text": string
}`
  : `{
  "title": string,
  "top_text": string,
  "bottom_text": ${template.isTwoSlot ? "string" : "null"},
  "post_caption": string
}`}`;

    console.log("[meme-gen] OpenAI prompt", {
      template: template.slug,
      templateType: template.template_type,
      memeMechanic: template.meme_mechanic,
      hasMechanicSpecificGuidance: Boolean(mechanicSpecificGuidance),
      hasTemplateSpecificGuidance: Boolean(templateSpecificGuidance),
      hasRetryCorrectiveGuidance: Boolean(retryCorrectiveGuidance),
      previousFailureRule,
      promoMode,
      ultraTightPromptMode,
      isTwoSlot: template.isTwoSlot,
    });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an expert meme writer. Return only JSON. No markdown. No extra keys.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[meme-gen] OpenAI error", {
        template: template.slug,
        attempt,
        status: res.status,
        text,
      });
      return { result: null, failureRule: "openai_error" };
    }

    const json = (await res.json()) as any;
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    const parsed = safeJsonParse(String(content));
    if (!parsed || typeof parsed !== "object") {
      console.error("[meme-gen] Validation failed (json_parse_failed)", {
        template: template.slug,
        attempt,
        slotType: template.isTwoSlot ? "2-slot" : "1-slot",
        content,
      });
      return { result: null, failureRule: "json_parse_failed" };
    }

    const p = parsed as any;

    const slot1ValidationLabel = "slot_1";
    const slot2ValidationLabel = "slot_2";
    const slot3ValidationLabel = "slot_3";
    const slot1Value = isThreeSlot ? p.slot_1_text : p.top_text;
    const slot2Value = isThreeSlot ? p.slot_2_text : p.bottom_text;
    const slot3Value = isThreeSlot ? p.slot_3_text : null;

    // Validation: avoid inserting broken rows.
    const titleValidation = isThreeSlot
      ? {
          value: template.template_name.slice(0, TITLE_MAX_CHARS),
          failRule: null as string | null,
          length: template.template_name.slice(0, TITLE_MAX_CHARS).length,
        }
      : validateTitle(p.title);
    const postCaptionValidation = isThreeSlot
      ? {
          value: null as string | null,
          failRule: null as string | null,
          length: null as number | null,
        }
      : validatePostCaption(p.post_caption);
    const topValidation = validateSlotTextSingleLine(
      slot1Value,
      template.slot_1_max_chars,
      slot1ValidationLabel,
      {
        allowShortLabelMode: allowShortLabelValidationMode(template),
        templateSlug: template.slug,
        templateType: template.template_type,
      }
    );
    const rawBottom = slot2Value;
    const bottomValidation = template.isTwoSlot || isThreeSlot
      ? validateSlotTextSingleLine(
          slot2Value,
          template.slot_2_max_chars,
          slot2ValidationLabel,
          {
            allowShortLabelMode: allowShortLabelValidationMode(template),
            templateSlug: template.slug,
            templateType: template.template_type,
          }
        )
      : { value: null as string | null, failRule: null as string | null, length: null as number | null };
    const slot3Validation = isThreeSlot
      ? validateSlotTextSingleLine(
          slot3Value,
          template.slot_3_max_chars,
          slot3ValidationLabel,
          {
            allowShortLabelMode: false,
            templateSlug: template.slug,
            templateType: template.template_type,
          }
        )
      : { value: null as string | null, failRule: null as string | null, length: null as number | null };

    if (!template.isTwoSlot && !isThreeSlot) {
      // Enforce the contract: 1-slot templates must have `bottom_text = null`.
      if (rawBottom !== null && rawBottom !== undefined) {
        const rawBottomNormLen = normalizeSingleLine(rawBottom)?.length ?? null;
        console.error("[meme-gen] Validation failed", {
          template: `${template.template_name} (${template.slug})`,
          templateType: template.template_type,
          attempt,
          slotType: "1-slot",
          title_len: titleValidation.length,
          title_max: TITLE_MAX_CHARS,
          top_len: topValidation.length,
          top_max: template.slot_1_max_chars,
          bottom_len: rawBottomNormLen,
          bottom_max: template.slot_2_max_chars,
          rule: "one_slot_bottom_text_not_null",
        });
        return { result: null, failureRule: "one_slot_bottom_text_not_null" };
      }
    }

    if (!titleValidation.value || !topValidation.value) {
      const rule = !titleValidation.failRule
        ? topValidation.failRule
        : titleValidation.failRule;
      console.error("[meme-gen] Validation failed", {
        template: `${template.template_name} (${template.slug})`,
        templateType: template.template_type,
        attempt,
        slotType: template.isTwoSlot ? "2-slot" : "1-slot",
        title_len: titleValidation.length,
        title_max: TITLE_MAX_CHARS,
        top_len: topValidation.length,
        top_max: template.slot_1_max_chars,
        bottom_len: template.isTwoSlot ? bottomValidation.length : null,
        bottom_max: template.isTwoSlot ? template.slot_2_max_chars : null,
        rule,
      });
      return { result: null, failureRule: rule ?? "validation_failed" };
    }

    if ((template.isTwoSlot || isThreeSlot) && !bottomValidation.value) {
      console.error("[meme-gen] Validation failed", {
        template: `${template.template_name} (${template.slug})`,
        templateType: template.template_type,
        attempt,
        slotType: isThreeSlot ? "3-slot" : "2-slot",
        title_len: titleValidation.length,
        title_max: TITLE_MAX_CHARS,
        top_len: topValidation.length,
        top_max: template.slot_1_max_chars,
        bottom_len: bottomValidation.length,
        bottom_max: template.slot_2_max_chars,
        rule: bottomValidation.failRule,
      });
      return {
        result: null,
        failureRule: bottomValidation.failRule ?? "validation_failed",
      };
    }

    if (isThreeSlot && !slot3Validation.value) {
      console.error("[meme-gen] Validation failed", {
        template: `${template.template_name} (${template.slug})`,
        templateType: template.template_type,
        attempt,
        slotType: "3-slot",
        title_len: titleValidation.length,
        title_max: TITLE_MAX_CHARS,
        top_len: topValidation.length,
        top_max: template.slot_1_max_chars,
        bottom_len: bottomValidation.length,
        bottom_max: template.slot_2_max_chars,
        slot_3_len: slot3Validation.length,
        slot_3_max: template.slot_3_max_chars,
        rule: slot3Validation.failRule,
      });
      return {
        result: null,
        failureRule: slot3Validation.failRule ?? "validation_failed",
      };
    }

    const finalTitle = titleValidation.value!;
    const finalTop = topValidation.value!;
    const finalBottom = template.isTwoSlot || isThreeSlot ? bottomValidation.value : null;
    const finalSlot3 = isThreeSlot ? slot3Validation.value : null;
    const finalPostCaption =
      postCaptionValidation.value ?? buildFallbackPostCaption({ variantContext });

    if (!postCaptionValidation.value) {
      console.log("[meme-gen] Using post_caption fallback", {
        template: template.slug,
        variantType: variantContext.variantType,
        failRule: postCaptionValidation.failRule,
        generatedLength: postCaptionValidation.length,
        fallbackPostCaption: finalPostCaption,
      });
    }

    return {
      result: {
        title: finalTitle,
        top_text: finalTop,
        bottom_text: finalBottom,
        slot_3_text: finalSlot3,
        post_caption: finalPostCaption,
      },
      failureRule: null,
    };
  };

  let insertedCount = 0;
  let failedCount = 0;
  let attemptedCount = 0;

  for (
    let poolIndex = 0;
    poolIndex < orderedTemplatePool.length &&
    insertedCount < batchSize;
    poolIndex++
  ) {
    const template = orderedTemplatePool[poolIndex];
    attemptedTemplateIds.add(template.template_id);
    attemptedCount++;
    const maxAttempts = 3;
    const templateVariantAssignment =
      templateVariantAssignments.find(
        (assignment) => assignment.template_id === template.template_id
      ) ?? null;
    const variantType: AssignedVariant =
      templateVariantAssignment?.variantType ?? "standard";
    const variantContext: VariantContext = {
      variantType,
      promoText: variantType === "promo" ? generationContext.promotion : null,
      importantDayKey:
        variantType === "important_day"
          ? generationContext.activeImportantDay?.key ?? null
          : null,
      importantDayLabel:
        variantType === "important_day"
          ? generationContext.activeImportantDay?.label ?? null
          : null,
      importantDayPromptContext:
        variantType === "important_day"
          ? generationContext.activeImportantDay?.promptContext ?? null
          : null,
    };
    const promoMode = derivePromoMode(template);
    const fallbackReplacementUsed = failedCount > 0;
    const variantMetadata =
      variantType === "important_day"
        ? {
            important_day_key: variantContext.importantDayKey,
            important_day_label: variantContext.importantDayLabel,
            media_type: template.asset_type === "video" ? "video" : "image",
          }
        : {
            media_type: template.asset_type === "video" ? "video" : "image",
          };
    let generated:
      | {
          title: string;
          top_text: string;
          bottom_text: string | null;
          slot_3_text: string | null;
          post_caption: string;
        }
      | null = null;
    let previousFailureRule: string | null = null;
    const ideaGroupId = randomUUID();

    console.log("[variant-prompt] ", {
      slug: template.slug,
      variantType,
      variantContext,
    });

    console.log("[meme-gen] Attempting template from ordered pool", {
      poolIndex: poolIndex + 1,
      template: template.slug,
      templateType: template.template_type,
      variantType,
      promoMode,
      fallbackReplacementUsed,
      ultraTightPromptMode: isUltraTightTemplate(template),
      hasPromotion: Boolean(promotion),
    });

    let attemptUsed = 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptUsed = attempt;
      const generationAttempt = await generateForTemplate(
        template,
        variantContext,
        promoMode,
        attempt,
        previousFailureRule
      );
      generated = generationAttempt.result;
      previousFailureRule = generationAttempt.failureRule;
      if (generated) break;

      console.error("[meme-gen] Generation failed; retrying", {
        template: template.slug,
        promoMode,
        attempt,
        targetedFailureRule: previousFailureRule,
        retryCorrectiveGuidanceActive: Boolean(previousFailureRule),
      });
    }

    if (!generated) {
      failedCount++;
      console.error("[meme-gen] Skipped template after retries", {
        template: `${template.template_name} (${template.slug})`,
        templateType: template.template_type,
        variantType,
        promoMode,
        attempts: maxAttempts,
        slotType: template.slot_3_role
          ? "3-slot"
          : template.isTwoSlot
            ? "2-slot"
            : "1-slot",
        wasRetried: maxAttempts > 1,
      });
      console.log("[meme-gen] Fallback replacement queued", {
        failedTemplate: template.slug,
        nextTemplate: orderedTemplatePool[poolIndex + 1]?.slug ?? null,
        insertedCount,
        failedCount,
      });
      continue;
    }

    let imageUrl: string | null = null;
    try {
      if (template.asset_type === "video") {
        const sourceVideoPath = template.source_media_path ?? "";
        if (!sourceVideoPath) {
          throw new Error("Video template is missing source_media_path");
        }
        const { data: baseBlob, error: baseDownloadError } =
          await adminSupabase.storage.from(memeTemplatesBucket).download(sourceVideoPath);

        if (baseDownloadError) {
          throw new Error(
            baseDownloadError.message ||
              `Failed to download base video: ${sourceVideoPath}`
          );
        }

        const arrayBuffer = await (baseBlob as any).arrayBuffer();
        const baseVideoBuffer = Buffer.from(arrayBuffer);

        const mp4Buffer = await renderMemeMP4FromTemplate({
          baseVideoBuffer,
          template,
          topText: generated.top_text,
        });

        const objectPath = `generated_memes/${user.id}/${template.template_id}/${randomUUID()}.mp4`;
        const { error: uploadError } = await adminSupabase.storage
          .from(generatedMemeBucket)
          .upload(objectPath, mp4Buffer, {
            contentType: "video/mp4",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(uploadError.message || `Failed to upload generated meme video`);
        }

        const publicUrlRes = adminSupabase.storage
          .from(generatedMemeBucket)
          .getPublicUrl(objectPath);
        imageUrl = publicUrlRes.data.publicUrl ?? null;
      } else {
        const imageFilename = template.image_filename ?? "";
        if (imageFilename) {
          const { data: baseBlob, error: baseDownloadError } =
            await adminSupabase.storage
              .from(memeTemplatesBucket)
              .download(imageFilename);

          if (baseDownloadError) {
            throw new Error(
              baseDownloadError.message ||
                `Failed to download base image: ${imageFilename}`
            );
          }

          const arrayBuffer = await (baseBlob as any).arrayBuffer();
          const baseImageBuffer = Buffer.from(arrayBuffer);

          const pngBuffer = await renderMemePNGFromTemplate({
            baseImageBuffer,
            template,
            topText: generated.top_text,
            bottomText: generated.bottom_text,
            slot_3_text: generated.slot_3_text ?? undefined,
          });

          const objectPath = `generated_memes/${user.id}/${template.template_id}/${randomUUID()}.png`;

          const { error: uploadError } = await adminSupabase.storage
            .from(generatedMemeBucket)
            .upload(objectPath, pngBuffer, {
              contentType: "image/png",
              upsert: true,
            });

          if (uploadError) {
            throw new Error(
              uploadError.message || `Failed to upload generated meme`
            );
          }

          const publicUrlRes = adminSupabase.storage
            .from(generatedMemeBucket)
            .getPublicUrl(objectPath);

          imageUrl = publicUrlRes.data.publicUrl ?? null;
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown render error";
      console.error("[meme-gen] Render/upload failed", {
        template: `${template.template_name} (${template.slug})`,
        templateType: template.template_type,
        message,
      });
      imageUrl = null;
    }

    const row = {
      user_id: user.id,
      template_id: template.template_id,
      idea_group_id: ideaGroupId,
      title: generated.title,
      format: template.template_name,
      top_text: generated.top_text,
      bottom_text: generated.bottom_text,
      post_caption: generated.post_caption,
      image_url: imageUrl,
      variant_type: variantType,
      generation_run_id: generationContext.generationRunId,
      batch_number: generationContext.batchNumber,
      variant_metadata: variantMetadata,
    };

    console.log("[variant-insert]", {
      slug: template.slug,
      variantType,
      generationRunId: generationContext.generationRunId,
      batchNumber: generationContext.batchNumber,
      variantMetadata,
      ideaGroupId,
      row,
    });

    if (isTemplateRegeneration) {
      console.log("[template-regen-insert]", {
        slug: template.slug,
        templateId: template.template_id,
        ideaGroupId,
        generationRunId: generationContext.generationRunId,
        row,
      });
    }

    const { error: insertError } = await supabase
      .from("generated_memes")
      .insert(row);

    if (insertError) {
      console.error("[meme-gen] Insert failed", {
        template: template.slug,
        templateType: template.template_type,
        variantType,
        promoMode,
        row,
        insertError,
      });
      failedCount++;
      console.error("[meme-gen] Skipped template (DB insert failed)", {
        template: `${template.template_name} (${template.slug})`,
        templateType: template.template_type,
        variantType,
        promoMode,
        attemptUsed,
        slotType: template.isTwoSlot ? "2-slot" : "1-slot",
        wasRetried: attemptUsed > 1,
      });
      console.log("[meme-gen] Fallback replacement queued", {
        failedTemplate: template.slug,
        nextTemplate: orderedTemplatePool[poolIndex + 1]?.slug ?? null,
        insertedCount,
        failedCount,
      });
      continue;
    }

    insertedCount++;
    console.log("[meme-gen] Inserted generated meme", {
      template: `${template.template_name} (${template.slug})`,
      templateType: template.template_type,
      variantType,
      promoMode,
      poolIndex: poolIndex + 1,
      slotType: template.isTwoSlot ? "2-slot" : "1-slot",
      attemptUsed,
      wasRetried: attemptUsed > 1,
      title_len: generated.title.length,
      top_len: generated.top_text.length,
      top_max: template.slot_1_max_chars,
      bottom_len: generated.bottom_text?.length ?? null,
      bottom_max: template.slot_2_max_chars,
    });
  }

  console.log("[meme-gen] Generation summary", {
    compatibleTemplates: compatibleTemplates.length,
    orderedTemplatePoolSize: orderedTemplatePool.length,
    batchSize: generationContext.batchSize,
    generationRunId: generationContext.generationRunId,
    batchNumber: generationContext.batchNumber,
    attemptedCount,
    insertedCount,
    failedCount,
    activeImportantDay: generationContext.activeImportantDay,
    templateVariantAssignments,
  });

  if (insertedCount === 0) {
    return { error: "Failed to generate memes. Check server logs for details." };
  }

  return { error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : null;
    console.error("[meme-gen] Unhandled generation error", {
      promotionContext,
      options,
      message,
      stack,
      error,
    });
    return { error: "Failed to generate memes. Check server logs for details." };
  }
}

export async function generateMoreMemes(
  outputFormat?: "square_image" | "square_video" | "vertical_slideshow"
): Promise<{ error: string | null }> {
  const result = await generateMockMemes(undefined, {
    limit: 3,
    excludeExistingUserTemplates: true,
    outputFormat,
  });

  revalidatePath("/dashboard/memes");
  return result;
}

export async function regenerateTemplateIdea(
  templateId: string,
  outputFormat?: "square_image" | "square_video" | "vertical_slideshow"
): Promise<{ error: string | null }> {
  const result = await generateMockMemes(undefined, {
    limit: 1,
    forcedTemplateId: templateId,
    forceStandardVariant: true,
    outputFormat,
  });

  revalidatePath("/dashboard/memes");
  return result;
}
