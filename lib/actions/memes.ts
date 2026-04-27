"use server";

import { createClient } from "@/lib/supabase/server";
import { getProfile, type Profile } from "@/lib/actions/profile";
import {
  englishVariantPromptInstruction,
  resolveEffectiveEnglishVariant,
} from "@/lib/onboarding/english-variant";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { renderMemePNGFromTemplate } from "@/renderer/renderMemeTemplate";
import { renderMemeMP4FromTemplate } from "@/renderer/renderMemeVideoTemplate";
import { renderSquareTextMemePng } from "@/renderer/renderSquareTextMeme";
import { renderEngagementTextMemePng } from "@/renderer/renderEngagementTextMeme";
import type { MemeOutputFormat } from "@/lib/memes/meme-output-formats";
import { getActiveImportantDay } from "@/lib/memes/variants/get-active-important-day";
import { runVerticalSlideshowGeneration } from "@/lib/memes/slideshow/generate-vertical-slideshow";
import {
  deriveWorkspaceFamilyTemplateHistory,
  selectTemplatesFromWorkspaceFamilyCycle,
} from "@/lib/workspace/template-cycle";
import { sanitizeGeneratedMemeTextFields } from "@/lib/memes/sanitize-meme-text";
import { normalizeNobodyMeSetupSlots } from "@/lib/memes/normalize-nobody-me-setup-slots";

// wow-doge is explicitly disabled in beta.
const DISABLED_TEMPLATE_SLUGS = new Set(["wow-doge"]);
const isWowDogeTemplateSlug = (slug: unknown): boolean =>
  DISABLED_TEMPLATE_SLUGS.has(String(slug ?? "").trim().toLowerCase());

/** Sanitized text fields returned when {@link generateMockMemes} runs with `qaCaptureSanitizedTextOnly`. */
export type QaCapturedGeneratedFields = {
  template_slug: string;
  title: string;
  top_text: string;
  bottom_text: string | null;
  slot_3_text: string | null;
  names?: string[];
};

export async function generateMockMemes(
  generationContextText?: string,
  options?: {
    limit?: number;
    excludeExistingUserTemplates?: boolean;
    forcedTemplateId?: string;
    forceStandardVariant?: boolean;
    outputFormat?: MemeOutputFormat;
    /** When set, all inserts in this run share this generation_run_id (e.g. content pack batch). */
    generationRunIdOverride?: string;
    /** Tags rows for content pack preview / unlock flow. */
    contentPack?: { batch: 1 | 2 | 3 };
    /** Workspace bridge: allows prompt-first flow to reuse this pipeline pre-auth. */
    workspaceContext?: {
      allowAnonymousWrite?: boolean;
      actorUserId?: string | null;
      storagePathNamespace?: string | null;
      workspaceId?: string | null;
      profileOverride?: Partial<Profile> | null;
    };
    /** Explicit promo signal extracted from conversation; null means non-promo request. */
    explicitPromoContext?: string | null;
    /** Neutral workspace summary from chat/workspace state. */
    workspaceContextSummary?: string | null;
    /**
     * Internal routing hint for `template_family` selection.
     * - When set to "engagement_text", only templates with template_family="engagement_text" are eligible.
     * - When null/undefined, square_text uses only template_family="square_text".
     */
    templateFamilyPreference?: "engagement_text" | null;
    /**
     * Dev QA only: after successful generation + sanitization, return text fields and skip
     * render, storage upload, and DB insert.
     */
    qaCaptureSanitizedTextOnly?: boolean;
  }
): Promise<{
  error: string | null;
  generationRunId?: string;
  qaSanitizedText?: QaCapturedGeneratedFields | null;
}> {
  try {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const workspaceContext = options?.workspaceContext;
  if (!workspaceContext) {
    console.error("[legacy-generation] generateMockMemes called without workspace context");
    return { error: "Legacy generation path no longer supported" };
  }
  const actorUserId = workspaceContext?.actorUserId ?? user?.id ?? null;
  const allowAnonymousWrite = Boolean(workspaceContext?.allowAnonymousWrite);
  if (!actorUserId && !allowAnonymousWrite) return { error: "Not authenticated" };

  const profileOverride = workspaceContext?.profileOverride ?? null;
  const profile = profileOverride
    ? ({
        id: profileOverride.id ?? actorUserId ?? randomUUID(),
        email: profileOverride.email ?? null,
        brand_name: profileOverride.brand_name ?? null,
        what_you_do: profileOverride.what_you_do ?? null,
        audience: profileOverride.audience ?? null,
        country: profileOverride.country ?? null,
        english_variant: profileOverride.english_variant ?? "en-GB",
        generation_mode: profileOverride.generation_mode ?? null,
        content_pack_unlocked_at: profileOverride.content_pack_unlocked_at ?? null,
        content_pack_last_completed_batch:
          profileOverride.content_pack_last_completed_batch ?? 0,
        onboarding_completed_at: profileOverride.onboarding_completed_at ?? null,
        created_at: profileOverride.created_at ?? new Date().toISOString(),
        updated_at: profileOverride.updated_at ?? new Date().toISOString(),
      } satisfies Profile)
    : await getProfile();
  if (!profile) {
    return { error: "Missing profile. Please complete onboarding again." };
  }

  const PROMOTION_MAX_CHARS = 280;
  const TITLE_MAX_CHARS = 45;
  const INITIAL_TEMPLATE_BATCH_SIZE = 1;

  type ExplicitPromoMode = "none" | "light" | "direct";
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
  type EngagementValidationMode =
    | "keyword_phrase"
    | "one_word_topic"
    | "agree_disagree_statement"
    | "hot_take_statement"
    | "emoji_topic"
    | "pick_one_options"
    | "fill_gap_statement";

  const normalizePromotionContext = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const collapsed = value.replace(/\s+/g, " ").trim();
    if (!collapsed) return null;
    return collapsed.slice(0, PROMOTION_MAX_CHARS).trim() || null;
  };
  const normalizeConversationContext = (value: unknown): string | null => {
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

  const conversationContext = normalizeConversationContext(generationContextText);
  const explicitPromoContext = normalizePromotionContext(options?.explicitPromoContext);
  const workspaceContextSummary = normalizeConversationContext(options?.workspaceContextSummary);
  const batchSize = options?.limit ?? INITIAL_TEMPLATE_BATCH_SIZE;
  const outputFormat: MemeOutputFormat = options?.outputFormat ?? "square_image";
  const templateFamilyPreference = options?.templateFamilyPreference ?? null;
  const targetAssetType = outputFormat === "square_video" ? "video" : "image";
  const forcedTemplateId = String(options?.forcedTemplateId ?? "").trim() || null;
  const forceStandardVariant = Boolean(options?.forceStandardVariant);
  const isTemplateRegeneration = Boolean(forcedTemplateId);
  const generationRunId = options?.generationRunIdOverride ?? randomUUID();
  const batchNumber = options?.contentPack?.batch ?? 1;
  const activeImportantDay = getActiveImportantDay();

  console.log("[important-day] activeImportantDay", activeImportantDay);

  const generationContext = {
    conversationContext,
    explicitPromoContext,
    workspaceContextSummary,
    batchSize,
    generationRunId,
    batchNumber,
    activeImportantDay,
  };

  console.log("[meme-gen] Generation start", {
    hasConversationContext: Boolean(generationContext.conversationContext),
    hasExplicitPromoContext: Boolean(generationContext.explicitPromoContext),
    outputFormat,
    targetAssetType,
    conversationContextLength: generationContext.conversationContext?.length ?? 0,
    explicitPromoLength: generationContext.explicitPromoContext?.length ?? 0,
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

  // Keep the explicit-promo heuristic deterministic and easy to tune.
  const deriveExplicitPromoMode = (template: {
    promotion_fit: string;
  }): ExplicitPromoMode => {
    if (!explicitPromoContext) return "none";

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
      return isDirectFriendlyPromoText(explicitPromoContext) ? "direct" : "light";
    }

    if (isDirectFriendlyPromoText(explicitPromoContext)) {
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
      promotionContext: generationContextText,
      context: {
        latestGenerationRequest: generationContext.conversationContext,
        workspaceContextSummary: generationContext.workspaceContextSummary,
        recentRefinementContext:
          generationContext.workspaceContextSummary &&
          generationContext.conversationContext &&
          generationContext.workspaceContextSummary !==
            generationContext.conversationContext
            ? generationContext.workspaceContextSummary
            : null,
        explicitPromoIntent: Boolean(generationContext.explicitPromoContext),
        promoContextExcerpt: generationContext.explicitPromoContext,
      },
      options: {
        limit: options?.limit ?? 1,
        excludeExistingUserTemplates: options?.excludeExistingUserTemplates,
        forcedTemplateId: options?.forcedTemplateId,
        forceStandardVariant: options?.forceStandardVariant,
        generationRunIdOverride: options?.generationRunIdOverride,
        contentPack: options?.contentPack,
        workspaceContext: {
          workspaceId: workspaceContext?.workspaceId ?? null,
          storagePathNamespace: workspaceContext?.storagePathNamespace ?? null,
        },
      },
    });
  }

  const { data: templatesRaw, error: templatesError } = await adminSupabase
    .from("meme_templates")
    .select("*")
    .eq("is_active", true);

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
    return (
      nonEmpty(t.slot_3_role) ||
      t.slot_3_max_chars != null ||
      t.slot_3_max_lines != null ||
      t.slot_3_x != null ||
      t.slot_3_y != null ||
      t.slot_3_width != null ||
      t.slot_3_height != null
    );
  };

  const hasCompleteSlot3Definition = (t: any): boolean => {
    if (!hasSlot3(t)) return false;
    return (
      nonEmpty(t.slot_3_role) &&
      t.slot_3_max_chars != null &&
      t.slot_3_max_lines != null &&
      t.slot_3_x != null &&
      t.slot_3_y != null &&
      t.slot_3_width != null &&
      t.slot_3_height != null
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

  const looksLikeIncompleteReactionSetup = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return true;

    // Common open-ended reaction setup stems that often require a missing second beat.
    const startsLikeReactionSetup =
      /^when\b/i.test(trimmed) ||
      /^when you\b/i.test(trimmed) ||
      /^me when\b/i.test(trimmed) ||
      /^that moment when\b/i.test(trimmed);
    if (!startsLikeReactionSetup) return false;

    // Open reportive endings: "and the client says", "and he goes", "and she asks", etc.
    if (
      /\b(and\s+)?(the\s+\w+\s+)?(client|customer|boss|manager|he|she|they|someone|everyone)\s+(says|goes|asks|asked|tells|told)\s*$/i.test(
        trimmed
      )
    ) {
      return true;
    }
    if (
      /\b(and\s+)?(you|they|he|she)\s+(say|go|ask|tell)\s*$/i.test(trimmed)
    ) {
      return true;
    }
    if (/\b(and\s+)?(is|was)\s+like\s*$/i.test(trimmed)) {
      return true;
    }

    return false;
  };

  const isReactionStyleTopCaptionTemplate = (
    template: CompatibleTemplate
  ): boolean => {
    if (template.template_type !== "top_caption") return false;
    const combined = `${template.meme_mechanic} ${template.slot_1_role} ${template.emotion_style}`
      .toLowerCase()
      .trim();
    return (
      combined.includes("reaction") ||
      combined.includes("exhausted") ||
      combined.includes("overwhelmed") ||
      combined.includes("frustrated")
    );
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

  const validateSlotTextSingleLine = (
    v: unknown,
    maxChars: number,
    slotLabel: string,
    options?: {
      allowShortLabelMode?: boolean;
      templateSlug?: string;
      templateType?: TemplateType;
      isReactionStyleTopCaptionTemplate?: boolean;
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
    if (options?.allowShortLabelMode) {
      // Tight side/overlay slots should not be rejected by sentence-fragment heuristics
      // once they already satisfy the hard character budget.
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
    if (
      options?.isReactionStyleTopCaptionTemplate &&
      slotLabel === "slot_1" &&
      looksLikeIncompleteReactionSetup(cleaned)
    ) {
      return {
        value: null,
        failRule: `${slotLabel}_incomplete_reaction_setup`,
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
    height_bucket?: string | null;
    /** Drives generation/render routing (square_meme | vertical_slideshow | square_text). */
    template_family: string;
    /** Raw DB layout key for family-specific behavior (e.g. finish_sentence, one_word, agree_disagree). */
    text_layout_type: string | null;
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

    // Rendering metadata (supports 1-slot / 2-slot / 3-slot templates)
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
    slot_3_x?: number | null;
    slot_3_y?: number | null;
    slot_3_width?: number | null;
    slot_3_height?: number | null;
  };

  type EngagementLayoutConfig = {
    generationContract: string;
    slotGuidance: (template: CompatibleTemplate) => string;
    templateSpecificGuidance?: string;
    validationMode?: EngagementValidationMode;
    namesCount?: number;
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

  const isThreeSlotTemplate = (template: CompatibleTemplate): boolean =>
    Boolean(template.slot_3_role);

  const isStructuredThreeSlotDebateTemplate = (
    template: CompatibleTemplate
  ): boolean => {
    if (!isThreeSlotTemplate(template)) return false;
    const role1 = String(template.slot_1_role ?? "").toLowerCase();
    const role2 = String(template.slot_2_role ?? "").toLowerCase();
    const role3 = String(template.slot_3_role ?? "").toLowerCase();
    const hasSubjectCenterRole = /(subject|topic|issue|problem|theme|question)/.test(
      role2
    );
    const hasTakeStyleSides =
      /(take|opinion|approach|perspective|stance|side|solution|method)/.test(
        role1
      ) &&
      /(take|opinion|approach|perspective|stance|side|solution|method)/.test(
        role3
      );
    return hasSubjectCenterRole && hasTakeStyleSides;
  };

  const getStructuredThreeSlotDebatePromptGuidance = (
    template: CompatibleTemplate
  ): string => {
    if (!isStructuredThreeSlotDebateTemplate(template)) return "";
    return `Structured three-slot debate mode:
- This is a 3-slot contrast/debate template with distinct roles.
- slot_1_text = left-side take (one approach/opinion).
- slot_2_text = central subject only (compact noun/topic label, not a sentence).
- slot_3_text = right-side contrasting take (different approach/opinion).
- slot_1_text and slot_3_text must disagree, contrast, or propose different ways to handle the same subject.
- slot_2_text target length: 1-3 words ideally; 4 words only if absolutely necessary.
- Avoid setup-caption patterns like "when you...", "when...", "POV...", "me when...".
- Keep all three slots scannable and punchy on-image.

Correct 3-slot examples:
{
  "slot_1_text": "Just pour boiling water",
  "slot_2_text": "Clogged sink",
  "slot_3_text": "Call a plumber"
}
{
  "slot_1_text": "Ship it now",
  "slot_2_text": "Homepage redesign",
  "slot_3_text": "Do user tests first"
}
{
  "slot_1_text": "Post every day",
  "slot_2_text": "Instagram growth",
  "slot_3_text": "Focus on quality"
}`;
  };

  const looksConversationalClause = (text: string): boolean => {
    return (
      /\b(i|we|you|they)\b/i.test(text) ||
      /\b(should|need to|have to|must|can|can't|dont|don't|won't|will)\b/i.test(
        text
      ) ||
      /\b(when|if|because|while|since|after|before|how to)\b/i.test(text)
    );
  };

  const validateThreeSlotCenterSubject = (
    value: string
  ): { value: string | null; failRule: string | null } => {
    const cleaned = normalizeSingleLine(value);
    if (!cleaned) return { value: null, failRule: "slot_2_missing_or_invalid" };
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length > 4) {
      return { value: null, failRule: "slot_2_not_short_subject" };
    }
    if (words.length > 3) {
      // 4 words are allowed only as an exception; keep strong pressure toward compact labels.
      const hasLabelSignals = /\b(strategy|plan|issue|problem|topic|budget|cost|flow|stack|roadmap|funnel|campaign|design|draft|review)\b/i.test(
        cleaned
      );
      if (!hasLabelSignals) {
        return { value: null, failRule: "slot_2_not_compact_label" };
      }
    }
    if (/[.!?]/.test(cleaned)) {
      if (/\?/.test(cleaned)) {
        return { value: null, failRule: "slot_2_question_like_subject" };
      }
      return { value: null, failRule: "slot_2_sentence_like_subject" };
    }
    if (/^(when|if|because|while|since|after|before|how|why|what)\b/i.test(cleaned)) {
      return { value: null, failRule: "slot_2_sentence_like_subject" };
    }
    if (looksConversationalClause(cleaned)) {
      return { value: null, failRule: "slot_2_clause_like_subject" };
    }
    return { value: cleaned, failRule: null };
  };

  /** LLM contract for template_family square_text only (plain text card; no base image/video). */
  const getSquareTextFamilyPromptSection = (
    template: CompatibleTemplate
  ): string => {
    if (template.template_family !== "square_text") return "";

    return `SQUARE TEXT MEME FORMAT (this row is template_family square_text — different from image/video memes):
- There is NO reaction image or video: only black text on a white 1080×1080 square. The words must carry the entire idea.
- This is NOT a top-caption layered over a meme picture. Do not write as if something visual will complete the joke.

1) COMPLETE STANDALONE THOUGHT (default)
- top_text must be ONE complete sentence or one complete standalone thought that reads finished on its own.
- No trailing commas. No clause that obviously waits for a punchline or picture.
- Unless template_logic explicitly requires a different mechanic, avoid fragment-style openers such as: "When...", "When you realize...", "POV...", "Me when...", "That moment when..." — they usually read incomplete on a blank card.
- Prefer a direct statement, sharp observation, contradiction, or "too real" homeowner line.

2) ONE CLEAN LINE (NO "WRITTEN" OR DASH-SPLIT THOUGHTS)
- The line should read as one natural thought: a single clean meme-native sentence, conversational and direct.
- Do NOT use em dashes (Unicode U+2014), en dashes (U+2013), or a hyphen used as a dramatic pivot mid-sentence.
- Do NOT use split-thought structures such as "X — Y" or "X - Y" where a dash turns one idea into two stitched halves (e.g. analogy setup, then a second clause "everyone has an opinion, but only you...").
- Avoid dash-led pivots, compare-and-explain phrasing, and mini-essay flow; those read like copywriting or brand blog prose, not a square text meme.
- Avoid heavy "it's like / feels like searching for..." analogy chains; prefer one blunt observation or relatable line stated simply.
- Goal: a clean thought, a natural observation, a direct meme-native line people would actually repost.

3) NO GENERIC PROMO / AD COPY ON THE CARD
- top_text must not sound like marketing, brochures, or CTAs.
- Avoid lines like: "your home needs a window upgrade", "transform your living space", "improve your home", "upgrade your windows", "expert window solutions", or similar polished sales language.
- Brand context informs the TOPIC (e.g. homes, windows, comfort), not the tone of an ad headline.

4) MEME-NATIVE, RELATABLE, SPECIFIC
- Aim for homeowner truths, small frustrations, sharp observations, specific realities — things people repost because they feel true, not because they are being sold something.
- Prefer concrete, specific angles over vague benefits (e.g. weak: "Your home needs improvement." Stronger direction: specific cause-and-effect or lived-detail truths tied to the audience).
- Use business context to pick WHAT to talk about, not to write a slogan.

5) TONE
- Closer to: relatable complaint, clever observation, "too real" thought, dry truth.
- Not: branded headline, sales message, corporate caption, or generic inspirational filler.

6) TWO SLOTS (only if this template uses two)
- If two slots: each block is still plain text on white — both must be complete thoughts unless template_logic defines a deliberate pair. No "setup waiting for image."

7) QUALITY CHECK (before you return JSON)
- Is top_text a complete thought on its own?
- Would it work alone on a plain white background with no image?
- Does it sound like a meme observation, not a business slogan?
- Is it specific enough to feel true?
- Is it one clean line without em/en dash pivots, "X — Y" splits, or written analogy chains?
- If not, rewrite before returning.

8) PROMO VARIANTS
- Even when promo_mode is active, do not turn top_text into offer/CTA headline copy. Keep the card meme-first and never invent promo facts.

`;
  };

  const getSquareTextSlotGuidance = (template: CompatibleTemplate): string => {
    const slot1Role = template.slot_1_role || "slot_1";
    const slot2Role = template.slot_2_role || "slot_2";
    if (template.isTwoSlot) {
      return `Slot behavior for square_text (plain text card):
Slot 1:
- role: ${slot1Role}
- One complete, standalone on-card message (see SQUARE TEXT MEME FORMAT above). Not a reaction-image setup.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}

Slot 2:
- role: ${slot2Role}
- Second complete text block on the same card (also meme-native, not ad copy).
- max_chars: ${template.slot_2_max_chars}
- max_lines: ${template.slot_2_max_lines}`;
    }
    return `Slot behavior for square_text (plain text card):
Slot 1:
- role: ${slot1Role}
- The entire visible meme: one complete standalone thought (see SQUARE TEXT MEME FORMAT). bottom_text must be null.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}`;
  };

  const getEngagementLayoutKey = (template: CompatibleTemplate): string => {
    return String(template.text_layout_type ?? "").trim().toLowerCase();
  };

  /** Known engagement_text layouts with explicit prompt + validation support. */
  const ENGAGEMENT_LAYOUT_FINISH_SENTENCE = "finish_sentence";
  const ENGAGEMENT_LAYOUT_BIRTHDAY_NAMES_LIST = "birthday_names_list";
  const ENGAGEMENT_LAYOUT_ONE_WORD = "one_word";
  const ENGAGEMENT_LAYOUT_AGREE_DISAGREE = "agree_disagree";
  const ENGAGEMENT_LAYOUT_HOT_TAKE = "hot_take";
  const ENGAGEMENT_LAYOUT_EMOJI_ONLY = "emoji_only";
  const ENGAGEMENT_LAYOUT_PICK_ONE = "pick_one";
  const ENGAGEMENT_LAYOUT_FILL_GAP = "fill_gap";

  /**
   * Hard JSON/text constraints for engagement_text (per text_layout_type).
   * Keeps prompt logic explicit when adding new layouts.
   */
  const getEngagementHardConstraintsBlock = (
    layoutKey: string,
    template: CompatibleTemplate,
    namesCount: number | null
  ): string => {
    switch (layoutKey) {
      case ENGAGEMENT_LAYOUT_BIRTHDAY_NAMES_LIST:
        return `- For engagement_text.birthday_names_list: top_text and bottom_text are required headline slots for "These {top_text} deserve {bottom_text} for their birthday".
- names MUST be present as an array with EXACTLY ${namesCount ?? 24} first names.
- names must contain no duplicates, no surnames, no numbering, and no bullets.`;
      case ENGAGEMENT_LAYOUT_ONE_WORD:
        return `- For engagement_text.one_word: top_text MUST be ONLY a short topic phrase — the thing people will describe in one word. It is injected into the fixed on-card copy: "Describe [top_text] in ONE word."
- Do NOT write instructions, questions, answers, opinions, or full sentences in top_text.
- Do NOT include the words "Describe", "ONE word", or "in one word" in top_text (the renderer adds those).
- No quote marks in top_text. No commas. No question marks or sentence-ending periods.
- bottom_text MUST be null.`;
      case ENGAGEMENT_LAYOUT_FINISH_SENTENCE:
        return `- For engagement_text.finish_sentence: top_text MUST be ONLY the keyword/phrase inserted into "I hate [keyword] because". It must NOT contain "I hate" or "because". bottom_text MUST be null.`;
      case ENGAGEMENT_LAYOUT_AGREE_DISAGREE:
        return `- For engagement_text.agree_disagree: top_text is a debatable claim for "two camps" (renderer adds "Agree or disagree?"). Lean comparison-style or polarising-but-balanced takes — NOT ranty absolutes.
- Target length: ideally 45–85 characters; rarely exceed 100; usually under ~16 words (stay under max_chars).
- Include at least one concrete anchor when possible (tool, ritual, customer type, workflow, scenario).
- Do NOT include "agree or disagree", questions, audience prompts, quote marks, or thought-leader filler ("the truth is", "here's the thing", "pro tip").
- Avoid naked abstract nouns ("success", "growth", "marketing") without a concrete hook.
- Prefer ending without . ! or ? on top_text when possible.
- bottom_text MUST be null.`;
      case ENGAGEMENT_LAYOUT_HOT_TAKE:
        return `- For engagement_text.hot_take: top_text is a sharper, contrarian line than agree_disagree (renderer adds "Hot take:"). Pattern-interrupt energy — not balanced debate phrasing.
- Target length: ideally 35–75 characters; rarely exceed 90; usually under ~14 words (stay under max_chars).
- Include at least one concrete anchor when possible (tool, ritual, audience, business scenario).
- Do NOT include "hot take", meta setups, questions, poll-like tone, LinkedIn/corporate filler, or the same comparison-first style as agree_disagree.
- Avoid: "the truth is", "here's the thing", "let that sink in", "in today's fast-paced world", "pro tip", "hot tip".
- Prefer ending without . ! or ? on top_text when possible.
- bottom_text MUST be null.`;
      case ENGAGEMENT_LAYOUT_EMOJI_ONLY:
        return `- For engagement_text.emoji_only: top_text MUST be ONLY a short plain topic (1–5 words) — what people will answer with emojis. Renderer shows: "Describe [top_text] using emojis only."
- Do NOT include emojis in top_text. Letters and numbers only (plus spaces between words). No punctuation.
- Do NOT write questions. Do NOT use the words "emoji", "emojis", "describe", or "using" in top_text (the card supplies that framing).
- bottom_text MUST be null.`;
      case ENGAGEMENT_LAYOUT_PICK_ONE:
        return `- For engagement_text.pick_one: top_text is option A and bottom_text is option B. Renderer shows "Pick one:" then both lines.
- Each option: 1–6 words, label-style, single line, no punctuation, no questions.
- Options must be a meaningful trade-off for this audience — not a cliché generic pair (e.g. coffee vs tea).
- Both slots are required.`;
      case ENGAGEMENT_LAYOUT_FILL_GAP:
        return `- For engagement_text.fill_gap: top_text MUST be one line that includes the exact blank token ______ (six underscores) as the gap to complete.
- Conceptual / framework energy (e.g. equations, principles) — not a joke setup, not a question, not audience instructions.
- Do NOT end top_text with a comma. Avoid question marks anywhere.
- bottom_text MUST be null.`;
      default:
        return `- For this engagement_text template (layout: ${layoutKey || "unknown"}): follow template_logic and the JSON shape. Obey slot roles and max_chars. If the template is one-slot, bottom_text MUST be null unless template metadata explicitly defines a second slot.`;
    }
  };

  const getEngagementQualityGateBlock = (
    layoutKey: string,
    namesCount: number | null
  ): string => {
    switch (layoutKey) {
      case ENGAGEMENT_LAYOUT_BIRTHDAY_NAMES_LIST:
        return `- Does the headline read naturally: "These {top_text} deserve {bottom_text} for their birthday"?
- Is names[] exactly ${namesCount ?? 24} first names, unique, no surnames?
- Do names match the audience/context where appropriate?
- If not, rewrite before returning JSON.`;
      case ENGAGEMENT_LAYOUT_ONE_WORD:
        return `- Is top_text ONLY a compact topic label (not a question, not the audience's one-word answer, not instructions)?
- Would it read naturally inside: "Describe {top_text} in ONE word."?
- Is it 1–5 words, with no quotes, commas, or sentence patterns?
- If not, rewrite before returning JSON.`;
      case ENGAGEMENT_LAYOUT_FINISH_SENTENCE:
        return `- Is top_text niche-specific and likely to trigger comments when plugged into: "I hate [keyword] because"?
- Does top_text avoid generic category words (e.g. marketing, business, fitness, success)?
- Does top_text NOT include "I hate" or "because"?
- If not, rewrite before returning JSON.`;
      case ENGAGEMENT_LAYOUT_AGREE_DISAGREE:
        return `- Does top_text sound like a natural yes/no or two-camps debate (comparison, "still works", overrated/underrated, better/worse than) — not a hot-take rant?
- Is it within the ideal length band (roughly 45–85 characters, under ~16 words)?
- Does it include a concrete anchor (not just abstract biz nouns)?
- Would it read naturally with "Agree or disagree?" underneath?
- If not, rewrite before returning JSON.`;
      case ENGAGEMENT_LAYOUT_HOT_TAKE:
        return `- Is top_text clearly bolder and more contrarian than a balanced debate line — timeline energy, not a poll?
- Is it within the ideal length band (roughly 35–75 characters, under ~14 words)?
- Does it avoid balanced "X vs Y" debate framing that would fit agree_disagree better?
- Is it still brand-safe and non-abusive?
- If not, rewrite before returning JSON.`;
      case ENGAGEMENT_LAYOUT_EMOJI_ONLY:
        return `- Is top_text ONLY a compact topic label (1–5 words) with no emojis, no punctuation, and no question vibe?
- Would it read naturally inside: "Describe {top_text} using emojis only."?
- Did you avoid meta words like "emoji", "describe", and "using" inside top_text?
- If not, rewrite before returning JSON.`;
      case ENGAGEMENT_LAYOUT_PICK_ONE:
        return `- Do the two options feel like a real dilemma or trade-off for this audience (not a lazy generic comparison)?
- Are both options short (≤6 words), parallel, and free of punctuation?
- Are they clearly different (not duplicates or near-duplicates)?
- If not, rewrite before returning JSON.`;
      case ENGAGEMENT_LAYOUT_FILL_GAP:
        return `- Does top_text contain the exact blank ______ and read as one insightful conceptual line (not a joke, not a question)?
- Is the blank clearly the single missing piece (no trailing comma)?
- If not, rewrite before returning JSON.`;
      default:
        return `- Does top_text match this template's layout contract and stay within character limits?
- If not, rewrite before returning JSON.`;
    }
  };

  /**
   * Validates top_text for one_word: topic phrase only, suitable for "Describe [topic] in ONE word."
   */
  const validateOneWordTopicPhrase = (
    text: string
  ): { failRule: string | null } => {
    const t = text.trim();
    if (!t) return { failRule: "slot_1_missing_or_invalid" };
    if (t.endsWith(",")) return { failRule: "one_word_trailing_comma" };
    if (/,/.test(t)) return { failRule: "one_word_contains_comma" };
    if (/["'`«»]/.test(t)) return { failRule: "one_word_contains_quotes" };
    if (/\?/.test(t)) return { failRule: "one_word_question_like" };
    if (/\./.test(t)) return { failRule: "one_word_sentence_like" };
    if (/\b(describe|in\s+one\s+word|one\s+word)\b/i.test(t)) {
      return { failRule: "one_word_instruction_filler" };
    }
    if (/^(what|why|how|when|who|which)\b/i.test(t)) {
      return { failRule: "one_word_question_stem" };
    }
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 5) {
      return { failRule: "one_word_word_count" };
    }
    if (words.length >= 3 && /\b(are|is|was|were|am|'re|'s)\b/i.test(t)) {
      return { failRule: "one_word_sentence_like" };
    }
    if (words.length >= 4 && /\band\b/i.test(t)) {
      return { failRule: "one_word_sentence_like" };
    }
    return { failRule: null };
  };

  /** Opinion statement for agree_disagree (renderer adds "Agree or disagree?"). */
  const validateAgreeDisagreeStatement = (
    text: string
  ): { failRule: string | null } => {
    const t = text.trim();
    if (!t) return { failRule: "slot_1_missing_or_invalid" };
    if (t.endsWith(",")) return { failRule: "agree_disagree_trailing_comma" };
    if (/[.!?]$/.test(t)) return { failRule: "agree_disagree_trailing_punct" };
    if (/\?/.test(t)) return { failRule: "agree_disagree_question_like" };
    if (/["'`«»]/.test(t)) return { failRule: "agree_disagree_contains_quotes" };
    if (/\bagree or disagree\b/i.test(t)) {
      return { failRule: "agree_disagree_framing_leak" };
    }
    if (
      /\b(what do you think|wdyt|sound off|vote below|comment below|let me know|tell us|your thoughts)\b/i.test(
        t
      )
    ) {
      return { failRule: "agree_disagree_audience_prompt" };
    }
    if (
      /^(do you|would you|are you|is it|can you|should you|don't you|dont you)\b/i.test(
        t
      )
    ) {
      return { failRule: "agree_disagree_question_stem" };
    }
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 3) return { failRule: "agree_disagree_too_short" };
    if (words.length > 22) return { failRule: "agree_disagree_too_long" };
    return { failRule: null };
  };

  /** Punchy opinion for hot_take (renderer adds "Hot take:"). */
  const validateHotTakeStatement = (
    text: string
  ): { failRule: string | null } => {
    const t = text.trim();
    if (!t) return { failRule: "slot_1_missing_or_invalid" };
    if (t.endsWith(",")) return { failRule: "hot_take_trailing_comma" };
    if (/[.!?]$/.test(t)) return { failRule: "hot_take_trailing_punct" };
    if (/\?/.test(t)) return { failRule: "hot_take_question_like" };
    if (/["'`«»]/.test(t)) return { failRule: "hot_take_contains_quotes" };
    if (/\bhot\s+take\b/i.test(t)) return { failRule: "hot_take_framing_leak" };
    if (
      /\b(here'?s my hot take|here is my hot take|my hot take on|unpopular opinion:|hot take on)\b/i.test(
        t
      )
    ) {
      return { failRule: "hot_take_meta_framing" };
    }
    if (/^(what|why|how|when|who|which|what'?s|whats)\b/i.test(t)) {
      return { failRule: "hot_take_question_stem" };
    }
    if (
      /\b(let me know|sound off|vote below|your thoughts|comment below|tell us)\b/i.test(
        t
      )
    ) {
      return { failRule: "hot_take_audience_prompt" };
    }
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 2) return { failRule: "hot_take_too_short" };
    if (words.length > 22) return { failRule: "hot_take_too_long" };
    return { failRule: null };
  };

  const EMOJI_CHAR_RE = /\p{Extended_Pictographic}/u;

  /** Topic label for emoji_only (renderer adds "Describe … using emojis only."). */
  const validateEmojiOnlyTopic = (text: string): { failRule: string | null } => {
    const t = text.trim();
    if (!t) return { failRule: "slot_1_missing_or_invalid" };
    if (EMOJI_CHAR_RE.test(t)) return { failRule: "emoji_topic_contains_emoji" };
    if (!/^[\p{L}\p{N}\s]+$/u.test(t)) return { failRule: "emoji_topic_contains_punct" };
    if (/\?/.test(t)) return { failRule: "emoji_topic_question_like" };
    if (/\b(emoji|emojis|describe|using)\b/i.test(t)) {
      return { failRule: "emoji_topic_banned_instruction_words" };
    }
    if (/^(what|why|how|when|who|which)\b/i.test(t)) {
      return { failRule: "emoji_topic_question_stem" };
    }
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 5) {
      return { failRule: "emoji_topic_word_count" };
    }
    return { failRule: null };
  };

  function levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const prevRow = new Array<number>(n + 1);
    const curRow = new Array<number>(n + 1);
    for (let j = 0; j <= n; j++) prevRow[j] = j;
    for (let i = 1; i <= m; i++) {
      curRow[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curRow[j] = Math.min(
          prevRow[j]! + 1,
          curRow[j - 1]! + 1,
          prevRow[j - 1]! + cost
        );
      }
      for (let j = 0; j <= n; j++) prevRow[j] = curRow[j]!;
    }
    return prevRow[n]!;
  }

  const TRIVIAL_PICK_ONE_PAIR_KEYS = new Set<string>([
    "books|movies",
    "cat|dog",
    "coffee|tea",
    "ios|android",
    "iphone|android",
    "morning|night",
    "pizza|burger",
    "summer|winter",
    "sweet|salty",
    "cats|dogs",
  ]);

  function normalizePickOneLabel(s: string): string {
    return s.toLowerCase().replace(/\s+/g, " ").trim();
  }

  function pickOnePairKey(a: string, b: string): string {
    const x = normalizePickOneLabel(a);
    const y = normalizePickOneLabel(b);
    return x <= y ? `${x}|${y}` : `${y}|${x}`;
  }

  /** Two option lines for pick_one (after per-slot single-line validation). */
  const validatePickOneOptions = (
    top: string,
    bottom: string
  ): { failRule: string | null } => {
    const a = top.trim();
    const b = bottom.trim();
    if (!a || !b) return { failRule: "pick_one_options_incomplete" };

    const punctRe = /[.!?,;:'"()[\]{}]/;
    for (const label of [a, b]) {
      if (punctRe.test(label)) return { failRule: "pick_one_option_punctuation" };
      if (/\?/.test(label)) return { failRule: "pick_one_option_question_like" };
      const words = label.split(/\s+/).filter(Boolean);
      if (words.length < 1 || words.length > 6) {
        return { failRule: "pick_one_option_word_count" };
      }
    }

    const na = normalizePickOneLabel(a);
    const nb = normalizePickOneLabel(b);
    if (na === nb) return { failRule: "pick_one_options_identical" };

    if (TRIVIAL_PICK_ONE_PAIR_KEYS.has(pickOnePairKey(a, b))) {
      return { failRule: "pick_one_options_trivial_pair" };
    }

    const maxLen = Math.max(na.length, nb.length);
    if (maxLen > 0 && maxLen <= 48) {
      const dist = levenshteinDistance(na, nb);
      if (dist <= 2 && na.length >= 4 && nb.length >= 4) {
        return { failRule: "pick_one_options_too_similar" };
      }
    }

    const wa = new Set(na.split(/\s+/).filter(Boolean));
    const wb = new Set(nb.split(/\s+/).filter(Boolean));
    if (wa.size > 0 && wb.size > 0 && wa.size === wb.size) {
      let inter = 0;
      for (const w of wa) if (wb.has(w)) inter++;
      if (inter === wa.size) return { failRule: "pick_one_options_too_similar" };
    }

    return { failRule: null };
  };

  const FILL_GAP_BLANK = "______";

  /** Statement with conceptual blank for fill_gap. */
  const validateFillGapStatement = (text: string): { failRule: string | null } => {
    const t = text.trim();
    if (!t) return { failRule: "slot_1_missing_or_invalid" };
    if (!t.includes(FILL_GAP_BLANK)) return { failRule: "fill_gap_missing_blank" };
    if (/\?/.test(t)) return { failRule: "fill_gap_question_like" };
    if (t.endsWith(",")) return { failRule: "fill_gap_trailing_comma" };
    const withoutBlanks = t.split(FILL_GAP_BLANK).join(" ").replace(/\s+/g, " ").trim();
    if (withoutBlanks.length < 6) return { failRule: "fill_gap_too_sparse" };
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length > 22) return { failRule: "fill_gap_too_long" };
    return { failRule: null };
  };

  const getFinishSentenceSlotGuidance = (template: CompatibleTemplate): string => {
    const slot1Role = template.slot_1_role || "keyword";
    return `Slot behavior for engagement_text.finish_sentence (keyword insert):
Slot 1:
- role: ${slot1Role}
- Generate a niche-specific keyword/phrase for: "I hate [keyword] because".
- Output must be the keyword/phrase ONLY.
- Word count: 2–4 words maximum.
- Must be a concise noun phrase (label-style), not a clause/sentence.
- Keep total characters comfortably under max_chars.
- No "I hate" or "because" words.
- Avoid “people who / clients who / members who / those who” constructions.
- Prefer concrete, socially recognizable annoyances over abstract categories.
- Keep it comment-triggering, emotionally recognizable, and tight.
- Avoid bland internal/admin wording unless transformed into a punchier social phrase.
- Prefer a fresh angle over the most obvious repeated pain point.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}`;
  };

  const ENGAGEMENT_LAYOUT_CONFIGS: Record<string, EngagementLayoutConfig> = {
    finish_sentence: {
      generationContract: `ENGAGEMENT TEXT MEME FORMAT (layout: finish_sentence):
- There is NO reaction image or video: this template is a fixed 2-line text layout rendered entirely in code on a white background.
- The visible structure is:
  1) "Finish this sentence."
  2) "I hate [keyword] because"
- Your job is ONLY to generate the niche-specific keyword/phrase that goes in the brackets.

OUTPUT CONTRACT (STRICT):
- Output ONLY slot_1 (top_text): the keyword/phrase.
- Keyword length: 2–4 words maximum.
- Format: concise noun phrase (label-style), not a sentence.
- Do not output "I hate" or "because" anywhere.
- No full clauses; avoid verb-started explanations and avoid trailing punctuation.
- Avoid “people who”, “members who”, “clients who”, “those who”, “anyone who”, “the ones who”, and similar “who/that/which” constructions.
- If you drift into a full sentence, shorten to a noun phrase.
- Prioritize phrases that trigger immediate reactions/comments from people in that niche.
- Prefer recurring annoyances, behaviours, habits, and socially recognizable frustrations over neutral operational wording.
- Avoid bland admin/business phrasing (e.g., generic scheduling/cancellation/internal-ops labels) unless phrased in a socially punchy way.
- Use a vivid, specific angle rather than the safest generic pain point.
- Repetition control: avoid repeating the most obvious angle if another equally valid niche-specific frustration exists.
- If recent context suggests a phrase was already used, choose a fresh angle (not a near-duplicate).

Examples:
Valid (keyword only):
- leg day excuses
- no-show bookings
- client revisions
- ghosted invoices
- streaky windows
- fake "on my way" texts
Invalid:
- "I hate leg day because"
- "people who skip leg day"
- "members skipping classes"
- "last-minute cancellations"
- "I hate how my manager schedules workouts"`,
      slotGuidance: getFinishSentenceSlotGuidance,
      templateSpecificGuidance: `Template-specific guidance: finish_sentence (engagement keyword)
- You are ONLY filling: "I hate [keyword] because".
- slot_1_text MUST be a keyword/phrase (2–4 words). No sentence-style clauses.
- Must be a noun phrase (label-style), e.g. "leg day excuses", "ghosted invoices".
- Hard bans: do not include the words "I hate" or "because" at all.
- Hard bans: do not use "people who / clients who / members who / those who / anyone who" style constructions.
- Texture target: socially native, emotionally recognizable, comment-triggering frustrations.
- Avoid bland operational/admin wording that sounds internal or generic.
- Repetition control: if one obvious angle already appeared, choose a different but equally niche-specific frustration.
- Examples:
  - Valid: "no-show bookings"
  - Valid: "ghosted invoices"
  - Valid: "fake \"on my way\" texts"
  - Invalid: "members skipping classes"
  - Invalid: "last-minute cancellations"
  - Invalid: "people who skip workouts"
  - Invalid: "I hate editing videos because they are annoying"`,
      validationMode: "keyword_phrase",
    },
    birthday_names_list: {
      generationContract: `ENGAGEMENT TEXT MEME FORMAT (layout: birthday_names_list):
- Headline format: "These {slot_1} deserve {slot_2} for their birthday".
- Generate:
  - top_text = slot_1 (subject group)
  - bottom_text = slot_2 (gift/reward phrase)
  - names = first-name list for rendering below headline

OUTPUT CONTRACT (STRICT):
- top_text and bottom_text must be concise noun-phrase style text.
- names must be an array of EXACTLY 24 first names.
- Names rules:
  - first names only
  - no surnames
  - no duplicates
  - no numbering
  - no bullets
  - no commentary
  - no extra keys
- Keep names relevant to audience/context where appropriate.

Examples:
Valid:
- top_text: "women"
- bottom_text: "a spa day"
- names: ["Emma", "Sofia", ... 24 total]
Invalid:
- top_text: "people who train at my gym"
- names with duplicates
- names with surnames
- names with numbering like "1. Emma"`,
      slotGuidance: (template) => `Slot behavior for engagement_text.birthday_names_list:
Slot 1 (top_text):
- role: ${template.slot_1_role || "subject group"}
- Short subject group phrase for: "These {slot_1} deserve..."
- Keep concise and social-native.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}

Slot 2 (bottom_text):
- role: ${template.slot_2_role || "gift/reward phrase"}
- Short gift/reward phrase for: "...deserve {slot_2} for their birthday".
- Keep concise and natural.
- max_chars: ${template.slot_2_max_chars}
- max_lines: ${template.slot_2_max_lines}

Names list:
- Return names: string[] with exactly 24 first names.
- No duplicates, no surnames, no numbering, no bullets.`,
      templateSpecificGuidance: `Template-specific guidance: birthday_names_list
- Write a socially-native, reaction-friendly birthday claim.
- top_text should feel like a recognizable cohort (e.g., women, mums, dads, gym girls, barbers).
- bottom_text should be a concrete reward phrase (e.g., "a spa day", "a new car", "a free holiday").
- Names should match the implied audience where possible.`,
      namesCount: 24,
    },
    one_word: {
      generationContract: `ENGAGEMENT TEXT MEME FORMAT (layout: one_word):
- There is NO reaction image or video: the card is fixed copy rendered in code on a white background.
- The visible line is exactly: "Describe [topic] in ONE word." where [topic] is replaced by your top_text only.

OUTPUT CONTRACT (STRICT):
- top_text = ONLY the topic phrase (what people will describe in one word in the comments).
- Length: 1–5 words. Short, natural, socially native (e.g. "Monday mornings", "your boss", "startup life").
- bottom_text MUST be null.
- No instructions in top_text: do not write "Describe...", "in one word", "ONE word", or questions.
- No quote marks. No commas. No question marks. No sentence-ending periods.
- No answers or opinions (not the one-word reply — only the topic hook).
- Use brand/audience context to pick a topic people will want to react to.

Examples (top_text only):
Valid: "Mondays", "gym motivation", "customer service", "your boss", "startup life"
Invalid: "Describe Mondays in one word"
Invalid: "chaotic and stressful"
Invalid: "What do you think about Mondays?"
Invalid: "Monday mornings are exhausting"`,
      slotGuidance: (template) => `Slot behavior for engagement_text.one_word:
Slot 1 (top_text):
- role: ${template.slot_1_role || "topic phrase"}
- ONLY the topic for: "Describe {top_text} in ONE word."
- 1–5 words, label-style, not a sentence or question.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}
- bottom_text must be null.`,
      templateSpecificGuidance: `Template-specific guidance: one_word
- Pick one concrete, comment-friendly topic aligned with the audience (pain, ritual, archetype, shared experience).
- Stay in headline/topic territory — never the commenter's answer.`,
      validationMode: "one_word_topic",
    },
    agree_disagree: {
      generationContract: `ENGAGEMENT TEXT MEME FORMAT (layout: agree_disagree):
- Fixed layout: your top_text, then the renderer prints "Agree or disagree?" — you only supply the claim.

STYLE (this layout vs hot_take):
- Aim for balanced-but-polarising debate: two natural sides, invite yes/no energy without sounding like a rant.
- STRONGLY prefer patterns like: better than / worse than / still works / doesn't work anymore / overrated / underrated / beats / matters more than / worth it vs not.
- Comparison or "two camps" beats a pure dump on something — readers should feel they could argue either side.

LENGTH (guidance — obey max_chars from template):
- Ideal: 45–85 characters. Rarely exceed 100. Usually under ~16 words.

ANTI-GENERIC (both layouts):
- Never use or echo: "The truth is", "Here's the thing", "Let that sink in", "In today's fast-paced world", "Pro tip", "Hot tip", thought-leader throat-clearing.
- Avoid abstract nouns alone ("success", "growth", "marketing", "branding") — tie to a concrete anchor: a tool, meeting type, channel, customer moment, creator workflow, etc.

DISCOURAGED here:
- Ranty absolutes with no second side ("everything is broken") unless still clearly debatable.
- Soft question vibe, poll tone, audience instructions.
- Framing text: "agree or disagree", "vote below", etc.

OUTPUT CONTRACT (STRICT):
- top_text = one debatable claim, single line in JSON, no newlines.
- bottom_text MUST be null.
- No hate, harassment, or extreme political bait. Brand-safe spice only.
- Avoid ending with . ! ? when possible.

Examples (top_text only):
Valid: "Deep work beats open-plan for real progress"
Valid: "Cold DMs still work if they're personal"
Valid: "LinkedIn carousels are overrated for most SMBs"
Invalid: "Agree or disagree: remote work wins"
Invalid: "The truth is marketing is hard"
Invalid: "What do you think about meetings?"`,
      slotGuidance: (template) => `Slot behavior for engagement_text.agree_disagree:
Slot 1 (top_text):
- role: ${template.slot_1_role || "debatable two-camps claim"}
- Debate-friendly: comparison, still/never, overrated/underrated, or better/worse — not the same contrarian-rant mode as hot_take.
- Ideal ~45–85 characters (~16 words max usually). Hard ceiling: max_chars ${template.slot_1_max_chars}.
- At least one concrete anchor when possible.
- bottom_text must be null.`,
      templateSpecificGuidance: `Template-specific guidance: agree_disagree
- Picture someone typing "hard agree" vs "absolutely not" — that's the split you want.
- Skip LinkedIn wisdom cosplay; write like a real thread where people pick sides.`,
      validationMode: "agree_disagree_statement",
    },
    hot_take: {
      generationContract: `ENGAGEMENT TEXT MEME FORMAT (layout: hot_take):
- Renderer prints "Hot take:" then your top_text — you only supply the line.

STYLE (this layout vs agree_disagree):
- Stronger, punchier, more contrarian than agree_disagree — pattern-interrupt, timeline energy.
- STRONGLY prefer patterns like: is overrated / is a waste of time / nobody cares about / doesn't matter / everyone pretends / is lying / is dead / stop pretending.
- NOT balanced debate copy: avoid the same "X is better than Y for Z" structure you would use for agree_disagree unless it is clearly edgy and one-sided.

LENGTH (guidance — obey max_chars from template):
- Ideal: 35–75 characters. Rarely exceed 90. Usually under ~14 words.

ANTI-GENERIC (both layouts):
- Never: "The truth is", "Here's the thing", "Let that sink in", "In today's fast-paced world", "Pro tip", "Hot tip", corporate mission-speak.
- Anchor in something specific: a ritual, tool, audience behaviour, creator reality — not vague "business" abstraction.

DISCOURAGED here:
- Balanced two-sides debate phrasing (save for agree_disagree).
- Poll-like or soft tone. Meta framing ("hot take:", "unpopular opinion:").
- Framing text containing "hot take".

OUTPUT CONTRACT (STRICT):
- top_text = one bold statement, single line in JSON, no newlines.
- bottom_text MUST be null.
- No questions or audience instructions. Brand-safe, non-abusive.
- Avoid trailing . ! ? when possible.

Examples (top_text only):
Valid: "Nobody reads your launch post twice"
Valid: "Your funnel is fine your hook is boring"
Valid: "Weekly status meetings are theatre"
Invalid: "Remote work is better than the office for focus" (fits agree_disagree better)
Invalid: "Hot take: email is dead"
Invalid: "Here's the thing about content"`,
      slotGuidance: (template) => `Slot behavior for engagement_text.hot_take:
Slot 1 (top_text):
- role: ${template.slot_1_role || "contrarian punchy statement"}
- Sharper than agree_disagree: waste of time, overrated, doesn't matter, everyone pretends — not balanced debate.
- Ideal ~35–75 characters (~14 words max usually). Hard ceiling: max_chars ${template.slot_1_max_chars}.
- Concrete anchor preferred; no LinkedIn filler.
- bottom_text must be null.`,
      templateSpecificGuidance: `Template-specific guidance: hot_take
- If it could drop into an agree/disagree card without changing tone, rewrite hotter or more specific.
- Write like someone posting before they second-guess — still safe, never cruel.`,
      validationMode: "hot_take_statement",
    },
    emoji_only: {
      generationContract: `ENGAGEMENT TEXT MEME FORMAT (layout: emoji_only):
- Fixed on-card copy: "Describe [topic] using emojis only." — you only output the topic in top_text.
- top_text = a short plain topic people can answer in emoji (NOT the emojis themselves).

OUTPUT CONTRACT (STRICT):
- 1–5 words, relatable and clear.
- Letters, numbers, and spaces only — no punctuation, no emojis in JSON.
- No questions. No instructions.
- Do NOT use the words "emoji", "emojis", "describe", or "using" in top_text.
- bottom_text MUST be null.

Examples (top_text only):
Valid: "this week at work", "your onboarding experience", "Q1 in one vibe"
Invalid: "describe your week" (banned words)
Invalid: "🙂 week" (emoji in slot)
Invalid: "How was your week?"`,
      slotGuidance: (template) => `Slot behavior for engagement_text.emoji_only:
Slot 1 (top_text):
- role: ${template.slot_1_role || "topic"}
- ONLY the topic for: "Describe {top_text} using emojis only."
- 1–5 words, no emojis, no punctuation, no questions, no instruction words.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}
- bottom_text must be null.`,
      templateSpecificGuidance: `Template-specific guidance: emoji_only
- Pick a slice-of-life or niche hook the audience can express in emoji without explaining.
- Never echo the card's framing ("describe", "emoji", "using").`,
      validationMode: "emoji_topic",
    },
    pick_one: {
      generationContract: `ENGAGEMENT TEXT MEME FORMAT (layout: pick_one):
- Renderer prints "Pick one:" then top_text (option A) then bottom_text (option B).

OUTPUT CONTRACT (STRICT):
- Two contrasting options that feel like a real trade-off for this audience.
- Each option: 1–6 words, single line, no punctuation, no questions.
- Avoid lazy generic pairs (coffee vs tea, cat vs dog, summer vs winter, etc.).
- Meaningful or difficult choices beat interchangeable lifestyle toggles.

Examples:
Valid top_text / bottom_text:
- "Deep work blocks" / "Always-on Slack"
- "Ship the MVP" / "Polish for another month"
Invalid: "Coffee" / "Tea"
Invalid: "Option A" / "Option B"`,
      slotGuidance: (template) => `Slot behavior for engagement_text.pick_one:
Slot 1 (top_text):
- role: ${template.slot_1_role || "option A"}
- First choice line (no punctuation).
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}

Slot 2 (bottom_text):
- role: ${template.slot_2_role || "option B"}
- Second choice line (no punctuation).
- max_chars: ${template.slot_2_max_chars}
- max_lines: ${template.slot_2_max_lines}`,
      templateSpecificGuidance: `Template-specific guidance: pick_one
- Force a stance: both options should feel costly to give up.
- Keep labels parallel in tone (both nouns, both verb phrases, etc.).`,
      validationMode: "pick_one_options",
    },
    fill_gap: {
      generationContract: `ENGAGEMENT TEXT MEME FORMAT (layout: fill_gap):
- top_text is one line shown on the card; it MUST include the exact blank token ______ (six underscores).
- Insightful conceptual completion prompts — frameworks, equations, principles — not jokes or questions.

OUTPUT CONTRACT (STRICT):
- Include ______ exactly once is ideal; at minimum the substring ______ must appear once.
- No question marks. Do not end with a comma.
- Not a joke punchline; not generic filler ("life is ______").
- bottom_text MUST be null.

Examples (top_text):
Valid: "Success = consistency + ______"
Valid: "Retention dies without ______"
Invalid: "Fill in the blank: ______"`,
      slotGuidance: (template) => `Slot behavior for engagement_text.fill_gap:
Slot 1 (top_text):
- role: ${template.slot_1_role || "statement with blank"}
- One line including ______ as the gap.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}
- bottom_text must be null.`,
      templateSpecificGuidance: `Template-specific guidance: fill_gap
- Aim for operator/creator insight: something people want to complete in the comments.
- Avoid meme-y randomness; keep it sharp and on-brand.`,
      validationMode: "fill_gap_statement",
    },
  };

  const getEngagementLayoutConfig = (
    template: CompatibleTemplate
  ): EngagementLayoutConfig | null => {
    if (template.template_family !== "engagement_text") return null;
    return ENGAGEMENT_LAYOUT_CONFIGS[getEngagementLayoutKey(template)] ?? null;
  };

  const validateFirstNamesList = (
    value: unknown,
    expectedCount: number
  ): { value: string[] | null; failRule: string | null } => {
    if (!Array.isArray(value)) {
      return { value: null, failRule: "names_missing_or_invalid" };
    }
    const cleaned = value
      .map((v) => normalizeSingleLine(v))
      .filter((v): v is string => Boolean(v))
      .map((v) => v.trim())
      .filter(Boolean);
    if (cleaned.length !== expectedCount) {
      return { value: null, failRule: "names_wrong_count" };
    }
    const seen = new Set<string>();
    for (const name of cleaned) {
      if (/\d/.test(name)) return { value: null, failRule: "names_contains_numbering" };
      if (/^\s*[-*]/.test(name)) return { value: null, failRule: "names_contains_bullets" };
      if (name.split(/\s+/).length > 1) return { value: null, failRule: "names_contains_surname" };
      const key = name.toLowerCase();
      if (seen.has(key)) return { value: null, failRule: "names_has_duplicates" };
      seen.add(key);
    }
    return { value: cleaned, failRule: null };
  };

  /** LLM contract for template_family engagement_text only (keyword in I hate [keyword] because). */
  const getEngagementTextFamilyPromptSection = (
    template: CompatibleTemplate
  ): string => {
    const layoutConfig = getEngagementLayoutConfig(template);
    if (layoutConfig) return layoutConfig.generationContract;
    if (template.template_family !== "engagement_text") return "";
    return `ENGAGEMENT TEXT MEME FORMAT (generic fallback):
- This template is in template_family engagement_text.
- Generate slot_1 keyword/phrase only.
- Keep wording concise and comment-triggering.
- Do not include "I hate" or "because".`;
  };

  const getEngagementTextSlotGuidance = (
    template: CompatibleTemplate
  ): string => {
    const layoutConfig = getEngagementLayoutConfig(template);
    if (layoutConfig) return layoutConfig.slotGuidance(template);
    const slot1Role = template.slot_1_role || "keyword";
    return `Slot behavior for engagement_text:
Slot 1:
- role: ${slot1Role}
- Output slot_1 keyword/phrase only.
- max_chars: ${template.slot_1_max_chars}
- max_lines: ${template.slot_1_max_lines}`;
  };

  /**
   * Body text only; {@link getMemeMechanicGuidance} wraps it in "Template behaviour" instructions.
   * Keys must match `meme_templates.meme_mechanic` (snake_case).
   */
  const MEME_MECHANIC_GUIDANCE: Record<string, string> = {
    rejection_reaction: `This meme is about rejecting or distancing from something after disappointment.

The humour should come from:
- a clear moment of rejection
- loss of interest
- realising something is not as good as expected

The punchline should feel like:
- "I don't want this anymore"
- "this isn't it"
- "instant regret"

Avoid neutral descriptions. This meme must express a strong negative reaction.`,
    reject_vs_prefer: `- Slot 1 must clearly feel like the worse, rejected, annoying, outdated, or less satisfying option.
- Slot 2 must clearly feel like the better, preferred, smarter, cleaner, or more satisfying option.
- The contrast should be directional and obvious immediately.
- Keep both slots short, parallel, and easy to compare at a glance.
- Avoid generic labels that do not create a strong before-vs-after or bad-vs-better contrast.
- Prefer concrete behaviors, tools, workflows, or situations over abstract business nouns.`,
    difficult_choice: `- Slot 1 and Slot 2 must both be plausible competing choices.
- The conflict should feel immediate: both options should pull against each other in a believable way.
- Make the dilemma obvious from the labels alone.
- Keep both slots short, parallel, and equally plausible.
- Avoid weak pairings that do not feel like a real stressful choice.`,
    nobody_me_setup: `- This template renders TWO separate text boxes. You MUST fill BOTH JSON fields.
- top_text must be EXACTLY the setup label: Nobody: (nothing else in this field).
- bottom_text must be the reaction line ONLY, starting with Me: followed by the specific moment (for example: Me: checking analytics again).
- Do NOT put "Nobody:" and "Me:" in the same JSON string. Do NOT merge both lines into top_text.
- Do not repeat the word Nobody inside bottom_text.`,
    shock_reaction: `- The joke should land as a sudden realisation or jolt — wide-eyed, visceral surprise.
- Prefer a sharp beat or twist over a slow explanation; the reader should feel the shock in one beat.`,
    disbelief_reaction: `- The humour is disbelief: "no way", "you cannot be serious", incredulity at what just happened.
- Show the gap between what was expected and what occurred; keep it punchy and human.`,
    confused_reaction: `- The humour is confusion or wrong assumptions — misreading the situation, talking past each other, or "wait, what?".
- Make the misunderstanding or cognitive whiplash obvious without a lecture.`,
    dread_reaction: `- The humour is dread, anticipation of something bad, or "I know how this ends".
- Build tension or fatalism; avoid flat reporting — the reader should feel the sinking feeling.`,
    overwhelmed_reaction: `- The humour is overload: too much at once, drowning in tasks, notifications, or chaos.
- Stack or exaggerate pressure so the reaction feels relatable and specific, not a vague "busy".`,
    smug_reaction: `- The humour is smugness, petty victory, or "told you so" energy — earned or delusional.
- Let one side clearly relish being right (or think they are); keep it snappy.`,
    approval_reaction: `- The humour is wholehearted approval, hype, or "finally" relief — enthusiastic yes-energy.
- Avoid bland praise; make the approval feel specific and meme-native.`,
    suspicious_thinking: `- The humour is side-eye, distrust, or "something is off here" — scepticism without a full detective monologue.
- One clear suspicious beat beats a neutral observation.`,
    awkward_reaction: `- The humour is awkwardness, cringe, or social friction — the silence after the wrong thing was said.
- Lean into discomfort; do not soften into a polite explanation.`,
    calm_in_chaos: `- The humour is calm or deadpan in the middle of chaos — contrast between storm and stillness.
- Make the chaos specific; the calm line should feel like the punchline, not a footnote.`,
    exhausted_reaction: `- The humour is bone-tired, running on fumes, or "I cannot do this again" energy.
- Specific fatigue beats generic "long day" wording.`,
    desperate_reaction: `- The humour is desperation, last-resort, or bargaining — urgency without sounding like ad copy.
- Make the need or panic legible in one or two beats.`,
  };

  const getMemeMechanicGuidance = (template: CompatibleTemplate): string => {
    const mechanic = String(template.meme_mechanic ?? "").trim();
    if (!mechanic) return "";
    if (mechanic === "reflective_realization") return "";
    const body = MEME_MECHANIC_GUIDANCE[mechanic];
    if (!body) return "";

    return `### Template behaviour (meme mechanic)
This meme uses the following format:

Mechanic: ${mechanic}

You MUST follow the expected behaviour of this meme type.

${body.trim()}`;
  };

  const getTemplateSpecificGuidance = (template: CompatibleTemplate): string => {
    const engagementLayoutConfig = getEngagementLayoutConfig(template);
    if (engagementLayoutConfig?.templateSpecificGuidance) {
      return engagementLayoutConfig.templateSpecificGuidance;
    }

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
      return `Retry correction (CRITICAL):
- This template ONLY supports ONE text field (top_text).
- bottom_text MUST be the JSON literal null — not a string, not empty text, not a second line.
- Put the ENTIRE meme in top_text only. Do not split setup/punchline across fields.
- Do not format as top/bottom or multiple sections.`;
    }

    if (previousFailureRule === "one_word_trailing_comma") {
      return `Retry correction:
- top_text must not end with a comma.
- Return a clean topic phrase only.`;
    }

    if (previousFailureRule === "one_word_contains_comma") {
      return `Retry correction:
- top_text must not contain commas (no multi-clause phrases).
- Use a short topic label only (1–5 words).`;
    }

    if (previousFailureRule === "one_word_contains_quotes") {
      return `Retry correction:
- top_text must not contain quote marks.
- Return the topic phrase in plain text only.`;
    }

    if (previousFailureRule === "one_word_question_like") {
      return `Retry correction:
- top_text must not be a question.
- Return a short topic label only (e.g. "Mondays", "your boss").`;
    }

    if (previousFailureRule === "one_word_instruction_filler") {
      return `Retry correction:
- top_text must NOT include instructional filler like "describe", "in one word", or "one word".
- The card already says that; you only supply the topic.`;
    }

    if (previousFailureRule === "one_word_question_stem") {
      return `Retry correction:
- top_text must not start with question words (what, why, how, when, who, which).
- Use a topic label only.`;
    }

    if (previousFailureRule === "one_word_word_count") {
      return `Retry correction:
- top_text must be 1–5 words only.
- Shorter topic hooks work best for "Describe [topic] in ONE word."`;
    }

    if (previousFailureRule === "one_word_sentence_like") {
      return `Retry correction:
- top_text must not read like a sentence, opinion, or answer.
- Use a compact topic only (what people react to), not how they feel about it.`;
    }

    const engagementOpinionRetries: Partial<Record<string, string>> = {
      agree_disagree_trailing_comma: `Retry correction:
- top_text must not end with a comma.
- Return a standalone opinion statement only.`,
      agree_disagree_trailing_punct: `Retry correction:
- Do not end top_text with . ! or ? — finish on a word so it reads clean on the card.`,
      agree_disagree_question_like: `Retry correction:
- top_text must not be a question.
- Write a flat statement people can agree or disagree with.`,
      agree_disagree_contains_quotes: `Retry correction:
- Remove quote marks from top_text.
- Plain opinion text only.`,
      agree_disagree_framing_leak: `Retry correction:
- Do NOT include "agree or disagree" (or variants) in top_text.
- The card adds that line automatically.`,
      agree_disagree_audience_prompt: `Retry correction:
- No audience prompts ("what do you think", "sound off", "let me know").
- Only the opinion statement.`,
      agree_disagree_question_stem: `Retry correction:
- Do not start with "Do you", "Would you", "Is it", etc.
- State the take directly.`,
      agree_disagree_too_short: `Retry correction:
- top_text needs at least ~3 words — a full debatable claim (comparison, still works, overrated/underrated, etc.).
- Aim for ~45–85 characters when possible.`,
      agree_disagree_too_long: `Retry correction:
- Shorten top_text — agree/disagree lines read best ~45–85 characters, rarely over 100 (~16 words).
- Stay under the character limit.`,
      hot_take_trailing_comma: `Retry correction:
- top_text must not end with a comma.`,
      hot_take_trailing_punct: `Retry correction:
- Do not end top_text with . ! or ? — end on a strong final word.`,
      hot_take_question_like: `Retry correction:
- Hot takes must be statements, not questions.`,
      hot_take_contains_quotes: `Retry correction:
- Remove quote marks from top_text.`,
      hot_take_framing_leak: `Retry correction:
- Do NOT include the phrase "hot take" in top_text.
- The header is added by the renderer.`,
      hot_take_meta_framing: `Retry correction:
- No meta setup ("here is my hot take", "unpopular opinion:").
- Only the punchy opinion line.`,
      hot_take_question_stem: `Retry correction:
- Do not start with question words (what, why, how, etc.).
- State the opinion outright.`,
      hot_take_audience_prompt: `Retry correction:
- No instructions to the audience ("let me know", "sound off").
- Statement only.`,
      hot_take_too_short: `Retry correction:
- top_text needs at least 2 words — make it a punchy contrarian line (waste of time, overrated, doesn't matter, etc.).`,
      hot_take_too_long: `Retry correction:
- Tighten top_text — hot takes read best ~35–75 characters, rarely over 90 (~14 words).
- Stay under the character limit.`,
      emoji_topic_contains_emoji: `Retry correction:
- top_text must be plain words only — no emojis (comments will supply emojis).`,
      emoji_topic_contains_punct: `Retry correction:
- top_text must use letters, numbers, and spaces only — no punctuation.`,
      emoji_topic_question_like: `Retry correction:
- top_text must not be a question — use a short topic label only.`,
      emoji_topic_question_stem: `Retry correction:
- Do not start top_text with question words (what, why, how, etc.).
- Use a compact topic phrase only.`,
      emoji_topic_banned_instruction_words: `Retry correction:
- Do NOT include "emoji", "describe", or "using" in top_text — the card adds that framing.`,
      emoji_topic_word_count: `Retry correction:
- top_text must be 1–5 words — a tight topic hook only.`,
      pick_one_options_incomplete: `Retry correction:
- pick_one requires BOTH top_text (option A) and bottom_text (option B).
- Each must be a short label (1–6 words), no punctuation.`,
      pick_one_option_punctuation: `Retry correction:
- Options must not contain punctuation — plain words only.`,
      pick_one_option_question_like: `Retry correction:
- Options must be statements/labels, not questions.`,
      pick_one_option_word_count: `Retry correction:
- Each option must be 1–6 words.`,
      pick_one_options_identical: `Retry correction:
- Options must be clearly different — rewrite one side with a contrasting angle.`,
      pick_one_options_trivial_pair: `Retry correction:
- Avoid cliché generic pairs (coffee/tea, cat/dog, etc.).
- Choose a meaningful trade-off for this audience.`,
      pick_one_options_too_similar: `Retry correction:
- Options read as duplicates or near-duplicates — widen the contrast while keeping both plausible.`,
      fill_gap_missing_blank: `Retry correction:
- top_text MUST include the exact blank token ______ (six underscores).`,
      fill_gap_question_like: `Retry correction:
- fill_gap lines must not be questions — use a conceptual statement with ______.`,
      fill_gap_trailing_comma: `Retry correction:
- Do not end top_text with a comma.`,
      fill_gap_too_sparse: `Retry correction:
- Add more conceptual content around the ______ blank — not just the blank alone.`,
      fill_gap_too_long: `Retry correction:
- Shorten top_text — keep it one sharp line with ______.`,
    };
    const opinionRetryHit = engagementOpinionRetries[previousFailureRule];
    if (opinionRetryHit) return opinionRetryHit;

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

    if (previousFailureRule === "slot_1_incomplete_reaction_setup") {
      return `Retry correction:
- slot_1 reads like an unfinished setup line and needs a complete reaction thought.
- Do not end with open reportive phrasing like "and the client says/goes/asks".
- Rewrite slot_1 as a fully finished, standalone reaction caption.
- Keep it meme-native and complete on one line.`;
    }

    if (previousFailureRule === "slot_2_not_short_subject") {
      return `Retry correction:
- slot_2_text must be a compact central subject label.
- Target 1-3 words (4 only if absolutely necessary).
- Use noun/topic label style only (e.g. "Clogged sink", "Homepage redesign", "Instagram growth").
- Do not write a clause or sentence in slot_2_text.`;
    }

    if (previousFailureRule === "slot_2_sentence_like_subject") {
      return `Retry correction:
- slot_2_text must not be sentence-like.
- Remove punctuation-heavy phrasing and avoid openers like "when", "if", or "because".
- Keep slot_2_text as a compact subject label only (1-3 words preferred).`;
    }

    if (previousFailureRule === "slot_2_question_like_subject") {
      return `Retry correction:
- slot_2_text cannot be a question.
- Remove question framing and rewrite as a short topic label.
- Good pattern: "Topic name" / "Issue name" / "Subject phrase".`;
    }

    if (previousFailureRule === "slot_2_clause_like_subject") {
      return `Retry correction:
- slot_2_text cannot read like conversational speech or a clause.
- Remove pronouns and helper verbs; rewrite to a compact issue/topic name.
- Keep it short and label-style (1-3 words preferred).`;
    }

    if (previousFailureRule === "slot_2_not_compact_label") {
      return `Retry correction:
- slot_2_text is too verbose for a center subject label.
- Compress it to a short issue/topic phrase (1-3 words preferred).
- If 4 words are used, they must still read like a tight noun/topic label.`;
    }

    if (previousFailureRule.endsWith("_missing_or_invalid") && slotLabel && slotMaxChars) {
      return `Retry correction:
- ${slotLabel} was missing or invalid.
- Provide a complete single-line value for ${slotLabel}.
- Keep it under ${slotMaxChars} characters.
${getTemplateTypeRetryShape()}`;
    }

    if (previousFailureRule.endsWith("_over_max_chars") && slotLabel && slotMaxChars) {
      const vMode = getEngagementLayoutConfig(template)?.validationMode;
      if (vMode === "keyword_phrase") {
        return `Retry correction:
- ${slotLabel} should be a keyword/phrase only that fits: "I hate [keyword] because".
- Do NOT include the words "I hate" or "because" in ${slotLabel}.
- Keep ${slotLabel} at or under ${slotMaxChars} characters.
- Prefer 2–4 word niche noun phrases (no clauses).
- Avoid “people who / clients who / members who / those who” constructions.
- Prefer shorter, tighter nouns + modifiers (2–4 words total).`;
      }
      if (vMode === "one_word_topic") {
        return `Retry correction:
- ${slotLabel} must be ONLY a short topic for: "Describe [topic] in ONE word."
- Keep ${slotLabel} at or under ${slotMaxChars} characters.
- Use 1–5 words, no quotes, no commas, no questions, no instructions.`;
      }
      if (vMode === "agree_disagree_statement") {
        return `Retry correction:
- ${slotLabel} must be a two-camps debatable claim (comparison / still works / overrated) — not a hot-take rant.
- Keep ${slotLabel} at or under ${slotMaxChars} characters; aim ~45–85.
- No questions, no "agree or disagree" phrasing, no thought-leader filler.`;
      }
      if (vMode === "hot_take_statement") {
        return `Retry correction:
- ${slotLabel} must be a sharp contrarian line — bolder than agree/disagree (renderer adds "Hot take:").
- Keep ${slotLabel} at or under ${slotMaxChars} characters; aim ~35–75.
- No "hot take" wording, no balanced debate phrasing, no LinkedIn filler.`;
      }
      if (vMode === "emoji_topic") {
        return `Retry correction:
- ${slotLabel} must be ONLY a short topic for: "Describe [topic] using emojis only."
- Keep ${slotLabel} at or under ${slotMaxChars} characters; 1–5 words, no emojis, no punctuation, no banned words.`;
      }
      if (vMode === "pick_one_options") {
        return `Retry correction:
- For pick_one, keep each option at or under its max_chars; 1–6 words, no punctuation, meaningful contrast.`;
      }
      if (vMode === "fill_gap_statement") {
        return `Retry correction:
- ${slotLabel} must stay at or under ${slotMaxChars} characters and include ______ with real conceptual content.`;
      }

      const strictTightMode =
        isUltraTightTemplate(template) &&
        (template.template_type === "side_caption" ||
          template.template_type === "overlay");
      return `Retry correction:
- The previous ${slotLabel} exceeded the character limit.
- Rewrite ${slotLabel} shorter without changing the core joke.
- Keep ${slotLabel} at or under ${slotMaxChars} characters.
- Remove filler words and choose simpler phrasing.
${strictTightMode
  ? `- Tight-template fallback: use a compact 1-3 word label, not a sentence-style clause.
- Target at least 3 characters under the limit when possible.`
  : ""}
${getTemplateTypeRetryShape()}`;
    }

    if (
      previousFailureRule.endsWith("_likely_fragment_cutoff") &&
      slotLabel &&
      slotMaxChars
    ) {
      const vModeLoose = getEngagementLayoutConfig(template)?.validationMode;
      if (vModeLoose === "keyword_phrase") {
        return `Retry correction:
- ${slotLabel} is allowed to be a short keyword phrase (not a sentence-style caption).
- ${slotLabel} must fit the "I hate [keyword] because" structure (keyword only).
- Do NOT include "I hate" or "because" in ${slotLabel}.
- Keep ${slotLabel} at or under ${slotMaxChars} characters.`;
      }
      if (vModeLoose === "one_word_topic") {
        return `Retry correction:
- ${slotLabel} should be a short topic label (1–5 words), not a sentence.
- It will appear inside: "Describe {topic} in ONE word."
- Do NOT include "describe", "in one word", quotes, commas, or questions.`;
      }
      if (vModeLoose === "agree_disagree_statement") {
        return `Retry correction:
- ${slotLabel} should read as a complete debatable claim (two sides), not a fragment.
- Aim ~45–85 characters; avoid dangling "and", "but", "so" at the end.`;
      }
      if (vModeLoose === "hot_take_statement") {
        return `Retry correction:
- ${slotLabel} should read as a complete punchy take, not a cut-off fragment.
- Aim ~35–75 characters; avoid balanced "X is better than Y" unless it is clearly edgy.`;
      }
      if (vModeLoose === "emoji_topic") {
        return `Retry correction:
- ${slotLabel} should be a complete topic label (1–5 words), not a fragment.
- No emojis, punctuation, or instruction words.`;
      }
      if (vModeLoose === "pick_one_options") {
        return `Retry correction:
- Each option should read as a complete short label, not a cut-off fragment.
- Keep contrast obvious and avoid generic pairs.`;
      }
      if (vModeLoose === "fill_gap_statement") {
        return `Retry correction:
- ${slotLabel} should be one complete conceptual line including ______, not a fragment.`;
      }

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
- Think compressed option labels, reaction labels, or comparison shorthand.
- Specificity rule for tight labels: use one concrete cue (e.g. queue, wrong order, rush hour), not a full descriptive sentence.`;
    }

    if (template.template_type === "overlay") {
      return `Ultra-tight template mode:
- This template is extremely space-constrained.
- Use compact, on-image labels (prefer 1-3 words).
- Do not write full setup/payoff sentences in overlay slots.
- Aim comfortably under max chars, not at the edge.
- Specificity rule for tight labels: one concrete cue is enough; avoid long descriptive detail.`;
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
    // Engagement keyword/topic layouts intentionally bypass sentence-fragment heuristics.
    const mode = getEngagementLayoutConfig(template)?.validationMode;
    if (
      mode === "keyword_phrase" ||
      mode === "one_word_topic" ||
      mode === "agree_disagree_statement" ||
      mode === "hot_take_statement" ||
      mode === "emoji_topic" ||
      mode === "pick_one_options" ||
      mode === "fill_gap_statement"
    ) {
      return true;
    }

    return (
      isUltraTightTemplate(template) &&
      (template.template_type === "side_caption" ||
        template.template_type === "overlay")
    );
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
        if (outputFormat === "square_text") {
          if (templateFamilyPreference === "engagement_text") {
            return family === "engagement_text";
          }
          return family === "square_text";
        }
        if (family === "square_text" || family === "engagement_text") return false;
        const assetType = String(t.asset_type ?? "image").trim().toLowerCase();
        return assetType === targetAssetType;
      })
      .filter((t: any) => {
        // If slot 3 is present, require full slot-3 contract so partially-configured
        // templates do not pass selection and then fail at generation/render time.
        return !hasSlot3(t) || hasCompleteSlot3Definition(t);
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
          height_bucket: t.height_bucket ? String(t.height_bucket).trim() : null,
          template_family: String(t.template_family ?? "square_meme").trim(),
          text_layout_type: t.text_layout_type
            ? String(t.text_layout_type).trim()
            : null,
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
          slot_3_x: toNullableInt(t.slot_3_x),
          slot_3_y: toNullableInt(t.slot_3_y),
          slot_3_width: toNullableInt(t.slot_3_width),
          slot_3_height: toNullableInt(t.slot_3_height),
        } satisfies CompatibleTemplate;
      })
      .filter((t) => t.template_id && t.template_name && t.slug && t.slot_1_role);
  };

  const compatibleTemplates = loadCompatibleTemplates(templates);

  if (compatibleTemplates.length === 0) {
    console.error("[meme-gen] No compatible templates found after filtering.");
    return {
      error:
        templateFamilyPreference === "engagement_text"
          ? "No active engagement templates found."
          : outputFormat === "square_video"
          ? "No active square video templates found."
          : outputFormat === "square_text"
            ? "No active square text templates found."
            : "No compatible meme templates found.",
    };
  }

  const excludedTemplateIds = new Set<string>();
  if (
    options?.excludeExistingUserTemplates &&
    actorUserId &&
    outputFormat !== "square_text"
  ) {
    const { data: existingRows, error: existingRowsError } = await supabase
      .from("generated_memes")
      .select("template_id")
      .eq("user_id", actorUserId)
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
  let templatePool = forcedTemplateId
    ? compatibleTemplates.filter(
        (template) =>
          template.template_id === forcedTemplateId || template.slug === forcedTemplateId
      )
    : compatibleTemplates.filter((template) => !attemptedTemplateIds.has(template.template_id));

  /** Full user/model prompt (not {@link conversationContext}, which is capped at 280 chars). */
  const promptForRichness = String(generationContextText ?? "").trim();
  /** Workspace pipeline: long directive + business block + angle wording (any case; matches tail + "Content Angle Focus"). */
  const contextIsRich =
    promptForRichness.length > 300 &&
    promptForRichness.includes("Business:") &&
    /\bcontent angle\b/i.test(promptForRichness);
  if (
    contextIsRich &&
    (!forcedTemplateId || !isWowDogeTemplateSlug(forcedTemplateId))
  ) {
    const withoutWowDoge = templatePool.filter((t) => !isWowDogeTemplateSlug(t.slug));
    if (withoutWowDoge.length !== templatePool.length) {
      console.log("[meme-gen] Rich business context: excluding wow-doge from template pool", {
        contextIsRich,
        poolBefore: templatePool.length,
        poolAfter: withoutWowDoge.length,
      });
    }
    templatePool =
      withoutWowDoge.length > 0
        ? withoutWowDoge
        : templatePool;
  }

  console.log("[meme-gen] Excluded template ids", {
    excludeExistingUserTemplates: Boolean(options?.excludeExistingUserTemplates),
    excludedCount: excludedTemplateIds.size,
    excludedTemplateIds: [...excludedTemplateIds],
  });

  console.log("[meme-gen] Template pool", {
    size: templatePool.length,
    templates: templatePool.map((template, index) => ({
      poolIndex: index + 1,
      template: template.slug,
      template_id: template.template_id,
      template_type: template.template_type,
      meme_mechanic: template.meme_mechanic || null,
      emotion_style: template.emotion_style || null,
    })),
  });

  if (templatePool.length === 0) {
    return {
      error: forcedTemplateId
        ? "Template not found for regeneration."
        : "No unused templates remain to generate.",
    };
  }

  let cycleDiagnostics: Record<string, unknown> = {
    selection_scope: "workspace_family_cycle",
    output_family: outputFormat,
    eligible_pool_size: templatePool.length,
    used_pool_size_before_pick: 0,
    unused_pool_size_before_pick: templatePool.length,
    cooldown_window_size: 3,
    cooldown_applied: false,
    cycle_exhausted: false,
    cycle_reset_applied: false,
    selected_template_id: null,
    selected_template_slug: null,
    selection_stage: "unused_pool",
  };

  let selectedTemplatesForBatch: CompatibleTemplate[] = [];
  if (workspaceContext?.workspaceId) {
    const { data: recentWorkspaceRows } = await adminSupabase
      .from("generated_memes")
      .select("template_id, created_at")
      .contains("variant_metadata", { workspace_id: workspaceContext.workspaceId })
      .order("created_at", { ascending: false })
      .limit(500);
    const eligibleTemplateIds = new Set(
      templatePool.map((template) => template.template_id)
    );
    const history = deriveWorkspaceFamilyTemplateHistory({
      rows: (recentWorkspaceRows ?? []) as Array<{ template_id?: unknown }>,
      eligibleTemplateIds,
      cooldownWindow: 3,
    });
    const cycle = selectTemplatesFromWorkspaceFamilyCycle({
      eligibleTemplates: templatePool,
      usedTemplateIds: history.usedTemplateIds,
      recentTemplateIds: history.recentTemplateIds,
      outputFamily: outputFormat,
      count: batchSize,
      cooldownWindow: 3,
    });
    cycleDiagnostics = cycle.diagnostics as Record<string, unknown>;
    selectedTemplatesForBatch = cycle.selected;
  }

  if (selectedTemplatesForBatch.length === 0) {
    const cycle = selectTemplatesFromWorkspaceFamilyCycle({
      eligibleTemplates: templatePool,
      usedTemplateIds: new Set<string>(),
      recentTemplateIds: [],
      outputFamily: outputFormat,
      count: batchSize,
      cooldownWindow: 3,
    });
    cycleDiagnostics = cycle.diagnostics as Record<string, unknown>;
    selectedTemplatesForBatch = cycle.selected;
  }
  const selectedTemplateIds = new Set(
    selectedTemplatesForBatch.map((template) => template.template_id)
  );
  const fallbackTemplatePool = templatePool.filter(
    (template) => !selectedTemplateIds.has(template.template_id)
  );
  const shuffledFallbackTemplatePool = [...fallbackTemplatePool].sort(
    () => Math.random() - 0.5
  );
  // Keep runtime bounded while still giving enough rescue attempts.
  const candidateTemplates = [
    ...selectedTemplatesForBatch,
    ...shuffledFallbackTemplatePool.slice(0, 8),
  ];
  const getExplicitPromoSuitabilityScore = (template: CompatibleTemplate): number => {
    if (!generationContext.explicitPromoContext) return -100;
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

  let explicitPromoTemplateIndex: number | null = null;
  if (
    !forceStandardVariant &&
    generationContext.explicitPromoContext &&
    selectedTemplatesForBatch.length > 0
  ) {
    explicitPromoTemplateIndex = selectedTemplatesForBatch.reduce(
      (bestIndex, template, index, templates) => {
        if (bestIndex === null) return index;

        const bestScore = getExplicitPromoSuitabilityScore(templates[bestIndex]);
        const currentScore = getExplicitPromoSuitabilityScore(template);

        if (currentScore > bestScore) return index;
        return bestIndex;
      },
      null as number | null
    );

    if (explicitPromoTemplateIndex !== null) {
      assignedVariants[explicitPromoTemplateIndex] = "promo";
    }
  }

  let importantDayTemplateIndex: number | null = null;
  if (
    !forceStandardVariant &&
    generationContext.activeImportantDay &&
    selectedTemplatesForBatch.length > 0
  ) {
    importantDayTemplateIndex = selectedTemplatesForBatch.findIndex(
      (_template, index) => index !== explicitPromoTemplateIndex
    );

    if (importantDayTemplateIndex !== -1) {
      assignedVariants[importantDayTemplateIndex] = "important_day";
    } else if (explicitPromoTemplateIndex === null && selectedTemplatesForBatch.length > 0) {
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
    cycleDiagnostics,
    selectedTemplates: selectedTemplatesForBatch.map((template, index) => ({
      selectionIndex: index + 1,
      template_id: template.template_id,
      slug: template.slug,
      templateType: template.template_type,
      explicitPromoSuitabilityScore: getExplicitPromoSuitabilityScore(template),
      assignedVariant:
        templateVariantAssignments[index]?.variantType ?? "standard",
    })),
    explicitPromoTemplateIndex,
    importantDayTemplateIndex,
    fallbackTemplateCount: candidateTemplates.length - selectedTemplatesForBatch.length,
  });

  const apiKey = process.env.OPENAI_API_KEY as string;
  const memeTemplatesBucket =
    process.env.MEME_TEMPLATES_BUCKET ?? "meme-templates";
  const generatedMemeBucket =
    process.env.MEME_GENERATED_MEMES_BUCKET ?? "generated-memes";

  console.log("[meme-gen] Starting generation loop", {
    generationRunId: generationContext.generationRunId,
    templatePoolSize: templatePool.length,
    targetInsertCount: batchSize,
    selectedTemplateCount: selectedTemplatesForBatch.length,
    candidateTemplateCount: candidateTemplates.length,
  });

  const generateForTemplate = async (
    template: CompatibleTemplate,
    variantContext: VariantContext,
    explicitPromoMode: ExplicitPromoMode,
    attempt: number,
    previousFailureRule: string | null
  ): Promise<
    | {
        result: {
          title: string;
          top_text: string;
          bottom_text: string | null;
          slot_3_text: string | null;
          names?: string[];
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
    const isReflectiveMode =
      String(template.meme_mechanic ?? "").trim() === "reflective_realization";
    const mechanicSpecificGuidance = isReflectiveMode
      ? ""
      : getMemeMechanicGuidance(template);
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

    if (isWowDogeTemplateSlug(template.slug)) {
      return { result: null, failureRule: "forbidden_template_wow_doge" };
    }

    const { topIdeal, bottomIdeal } = getIdealSlotTargets(template, attempt);
    const isThreeSlot = !!template.slot_3_role;
    const structuredThreeSlotDebateMode =
      isStructuredThreeSlotDebateTemplate(template);
    const engagementLayout = getEngagementLayoutConfig(template);
    const namesCount = engagementLayout?.namesCount ?? null;
    const engagementLayoutKey = getEngagementLayoutKey(template);
    /** Single visible caption: not 3-slot, not birthday-names layout, not two-slot image templates. */
    const isOneSlotMeme =
      !isThreeSlot && !namesCount && !template.isTwoSlot;

    const oneSlotCriticalOutputRule = isOneSlotMeme
      ? `
CRITICAL OUTPUT RULE:

This template ONLY supports ONE text field.

You MUST:
- Write ONLY the main caption (top_text)
- DO NOT include bottom text
- DO NOT include multiple sections
- DO NOT format as top/bottom
- DO NOT include line breaks that imply multiple sections

If you include bottom text, the output will be rejected.

`
      : "";

    const explicitPromoModeInstructions =
      variantContext.variantType !== "promo"
        ? `Promo mode: none
- Ignore the promotion entirely for this template.
- Make the meme about the brand/audience context only.`
        : explicitPromoMode === "direct"
        ? `Promo mode: direct
- This is a direct promo-capable variant.
- If the promotion fits naturally, keep the offer wording recognisable.
- Prefer the exact phrase or a very tight faithful rendering when possible.
- Do not dilute the offer into a vague broader idea.
- The joke must still work first, not the ad message.
- Do not sound like a banner headline, ad slogan, or campaign copy.
- If the exact wording becomes clunky or breaks the meme, omit it rather than distorting it inaccurately.`
        : explicitPromoMode === "light"
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
        explicitPromoMode,
        explicitPromoModeInstructions,
      });
    }

    const conversationContextBlock = `Conversation context:
- latest_generation_request: ${generationContext.conversationContext ?? "None"}
- workspace_context_summary: ${generationContext.workspaceContextSummary ?? "None"}`;

    const promoContextBlock =
      variantContext.variantType === "promo" || variantContext.promoText
        ? `Explicit promo context:
- normalized_promo_context: ${variantContext.promoText ?? "None"}
- promo_mode: ${variantContext.variantType === "promo" ? explicitPromoMode : "none"}`
        : `Explicit promo context:
- normalized_promo_context: None
- promo_mode: none`;

    const promoSafetyRules =
      variantContext.variantType === "promo"
        ? `- If you reference the promotion, preserve exact facts from the promo context. Never invent or alter discount amounts, dates, pricing, or offer terms.
- If exact promo facts do not fit naturally or within the slot limits, leave them out rather than changing them.`
        : `- Do not assume promotional intent when no explicit offer context is provided.`;

    const imageVideoAntiGenericRules =
      isReflectiveMode ||
      template.template_family === "square_text" ||
      template.template_family === "engagement_text"
        ? ""
        : `Anti-generic rules for square_image/square_video:
- Do not default to "When..." unless the moment is clearly specific and distinctive.
- Avoid stock meme stems without a concrete twist (generic "Monday mood", empty "POV", broad "when life...").
- Avoid abstract headline nouns unless this template explicitly calls for label-style text.
- Do not write campaign straplines, ad slogans, or interchangeable business-safe phrasing.
- If the line could be reused across industries by swapping one noun, it is invalid - rewrite it.`;

    const conditionalPromoInstruction =
      variantContext.variantType === "promo"
        ? `${promoContextBlock}
${explicitPromoModeInstructions}
${variantPromptGuidance}
${promoSafetyRules}`
        : `${promoContextBlock}
Promo handling:
- No explicit promo intent is present. Keep this non-promotional by default.
${promoSafetyRules}`;
    const tightLabelMode =
      isUltraTightTemplate(template) &&
      (template.template_type === "side_caption" ||
        template.template_type === "overlay");

    const primaryCreativeObjectiveBlock = isReflectiveMode
      ? `Reflective creative objective (this is NOT a punchline meme):
- Deliver one quiet, emotionally resonant line aligned with the "Template-Specific Writing Rules" and "Emotional Tone" sections below.
- Ground it in home, life, or gentle observation; wistful or warm is fine; avoid snark, hype, or joke rhythm.
- Do not force setup→punchline, contrast memes, or slapstick.
- One concrete sensory or emotional detail is enough; keep the voice sincere and understated.`
      : `Primary creative objective:
- Write one specific, lived-in moment (not a category statement).
- Prefer concrete micro-situations over general truths.
- Include at least one tangible detail from a real moment (for example: queue, wrong order, sauce, rush hour, closing time, last item).${
          tightLabelMode
            ? ` For tight side/overlay templates, a compact concrete cue is enough (no full sentence required).`
            : ""
        }
- Use a clear tension pattern (expectation vs reality, effort vs outcome, confidence vs chaos, or desire vs consequence).
- Reject generic meme templates without a concrete twist.
- If the line could apply to any business, rewrite it to be more specific and relatable.
- Match the template's emotional mechanic on first read.`;

    const reflectiveModeWritingRulesSection = isReflectiveMode
      ? `### Template-Specific Writing Rules (CRITICAL)
You MUST follow these rules exactly:

${template.template_logic}

### Emotional Tone

${template.emotion_style}

### Reflective mode — hard constraints (critical)
- Output MUST read as a single calm line in the primary caption field (usually top_text); obey the JSON shape for this template (use null for bottom_text when this template is single-line).
- No punchline or second beat.
- No "when… and…" or other forced contrast structure.
- No exaggerated humour, reaction-meme phrasing, or jokey cadence (avoid "POV", "me when", instant-regret beats, snark pile-ons).

If the output reads like a joke or a standard meme punchline, it is invalid.
`
      : "";

    const memeStructureEnforcementBlock = isReflectiveMode
      ? ""
      : `### Meme structure enforcement (critical)
The output MUST follow a clear meme format. This is not optional.

Each meme must include at least one of the following structures:
- Setup → Punchline
- Expectation → Reality
- Situation → Reaction
- Customer behaviour → Business reaction

The humour must come from:
- contrast
- exaggeration
- emotional reaction

### Hard constraints — meme-native shape (critical)
- Do NOT output plain sentences or statements.
- Do NOT output neutral observations.
- Do NOT output text that reads like normal conversation or explanation.

If the output could be said in a normal conversation without being funny, it is invalid.

### Internal validation (meme check)
Before finalising the output, internally validate:
- Does this clearly look like a meme format?
- Is there a contrast, tension, or punchline?
- Would this work when placed on a meme template?

If NOT, the output must be rewritten.

### Tone reinforcement
The humour should feel like insider knowledge of the industry AND should trigger a recognisable emotional reaction (e.g. frustration, irony, relief, awkwardness).

`;

    const prompt = `Task:
Generate one meme payload for the given template and return valid JSON only.

${primaryCreativeObjectiveBlock}

Context:
${conversationContextBlock}
Brand context:
- brand_name: ${brand_name}
- what_you_do: ${what_you_do}
- audience: ${audience}
- country: ${country}
- ${englishVariantPromptInstruction(resolveEffectiveEnglishVariant(profile.english_variant))}

Template behavior:
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

${reflectiveModeWritingRulesSection}
${getSquareTextFamilyPromptSection(template)}
${getEngagementTextFamilyPromptSection(template)}
${template.template_family === "square_text" || template.template_family === "engagement_text" || isReflectiveMode ? "" : getTemplateTypeWritingGuidance(template)}
${template.template_family === "square_text" ? getSquareTextSlotGuidance(template) : template.template_family === "engagement_text" ? getEngagementTextSlotGuidance(template) : getSlotWritingGuidance(template)}
${isThreeSlot
  ? `Three-slot output mapping:
- slot_1_role ("${template.slot_1_role}") -> slot_1_text
- slot_2_role ("${template.slot_2_role ?? "slot_2"}") -> slot_2_text
- slot_3_role ("${template.slot_3_role ?? "slot_3"}") -> slot_3_text
- Keep each slot value single-line and complete.
- Do not include newline characters in any slot value.`
  : ""}
${getStructuredThreeSlotDebatePromptGuidance(template)}
${mechanicSpecificGuidance}
${templateSpecificGuidance}
${getUltraTightPromptGuidance(template)}
${imageVideoAntiGenericRules}

Conditional promo handling:
${conditionalPromoInstruction}

Hard constraints (must obey):
${
  template.template_family === "square_text"
    ? `- For square_text: top_text must read as a finished standalone thought on a plain text card (not a teaser line for an image). Avoid trailing commas that imply more is coming.
`
    : template.template_family === "engagement_text"
      ? getEngagementHardConstraintsBlock(
          engagementLayoutKey,
          template,
          namesCount
        )
      : ""
}- top_text MUST be <= ${template.slot_1_max_chars} characters and complete (no mid-word cut-offs).
- top_text should ideally be <= ${topIdeal} characters.
${
  isThreeSlot
    ? ""
    : namesCount
      ? `- bottom_text MUST be <= ${template.slot_2_max_chars} characters and complete (no mid-word cut-offs).
- bottom_text should ideally be <= ${bottomIdeal} characters when present.`
      : template.isTwoSlot
        ? `- bottom_text MUST be <= ${template.slot_2_max_chars} characters when present, and complete.
- bottom_text should ideally be <= ${bottomIdeal} characters when present.`
        : `- bottom_text MUST be the JSON literal null (not an empty string, not a second caption). This template has ONLY top_text.`
}
${oneSlotCriticalOutputRule}
${structuredThreeSlotDebateMode
  ? `- For structured 3-slot debate templates: slot_2_text must be a compact central subject label (1-3 words ideally; 4 only if absolutely necessary), not a sentence.
- For structured 3-slot debate templates: slot_1_text and slot_3_text must present contrasting takes about the same slot_2 subject.
- For structured 3-slot debate templates: do not use setup openers like "when you...", "when...", "POV...", or "me when..." in any slot.`
  : ""}
- Do not include markdown, HTML, code blocks, or newline characters.
- Do not include disallowed/unsafe content (hate, sexual, illegal, harassment, personal data).
- Never end top_text, bottom_text, or any slot text (slot_1_text, slot_2_text, slot_3_text) with a trailing comma; finished lines should not look cut off.

Quality gate before return:
${template.template_family === "engagement_text"
  ? getEngagementQualityGateBlock(engagementLayoutKey, namesCount)
  : structuredThreeSlotDebateMode ? `- Does slot_2_text read as a compact subject label (1-3 words ideally; 4 only if truly necessary), not a sentence/question/clause?
- Do slot_1_text and slot_3_text clearly contrast as two different takes on that subject?
- Are all slots concise and scannable on-image?
- Does the output avoid "when you..." style setup lines?
- If not, rewrite before returning JSON.` : isReflectiveMode ? `- Does the line honour template_logic and emotion_style (quiet, sincere, not a joke)?
- Is it a single calm line without punchline, "and…" contrast, or reaction-meme beats?
- Would it feel wrong if read as humour-first viral meme copy? If yes, good; if it sounds jokey, rewrite.
- Does every field fit constraints without sounding clipped?
- If not, rewrite before returning JSON.` : `- Is the caption a specific situation rather than a generic statement?
- Does it include at least one tangible detail from a real moment?
- Is the emotional mechanic obvious for this template?
- Does it avoid ad-like or interchangeable business phrasing?
- Does every field fit constraints without sounding clipped?
- If not, rewrite before returning JSON.`}
${memeStructureEnforcementBlock}
${retryCorrectiveGuidance}

Return ONLY valid JSON with this exact shape:
${isThreeSlot
  ? `{
  "slot_1_text": string,
  "slot_2_text": string,
  "slot_3_text": string
}`
  : namesCount
    ? `{
  "title": string,
  "top_text": string,
  "bottom_text": string,
  "names": string[] // EXACTLY ${namesCount} first names
}`
  : `{
  "title": string,
  "top_text": string,
  "bottom_text": ${template.isTwoSlot ? "string" : "null"}
}`}`;

    console.log("[meme-gen] OpenAI prompt", {
      template: template.slug,
      templateType: template.template_type,
      templateFamily: template.template_family,
      textLayoutType: template.text_layout_type,
      engagementLayoutKey,
      hasEngagementLayoutConfig: Boolean(engagementLayout),
      memeMechanic: template.meme_mechanic,
      isReflectiveMode,
      hasMechanicSpecificGuidance: Boolean(mechanicSpecificGuidance),
      hasTemplateSpecificGuidance: Boolean(templateSpecificGuidance),
      hasRetryCorrectiveGuidance: Boolean(retryCorrectiveGuidance),
      previousFailureRule,
      explicitPromoMode,
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
    if (template.template_family === "engagement_text") {
      console.log("[meme-gen] Engagement raw model output", {
        template: template.slug,
        textLayoutType: template.text_layout_type,
        contentPreview: String(content).slice(0, 400),
      });
    }
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
    if (template.template_family === "engagement_text") {
      console.log("[meme-gen] Engagement parsed payload keys", {
        template: template.slug,
        textLayoutType: template.text_layout_type,
        keys: Object.keys(p ?? {}),
        hasNamesArray: Array.isArray(p?.names),
      });
    }

    if (isOneSlotMeme) {
      p.bottom_text = null;
    }

    const slot1ValidationLabel = "slot_1";
    const slot2ValidationLabel = "slot_2";
    const slot3ValidationLabel = "slot_3";
    let slot1Value = isThreeSlot ? p.slot_1_text : p.top_text;
    let slot2Value = isThreeSlot ? p.slot_2_text : p.bottom_text;
    if (
      !isThreeSlot &&
      template.isTwoSlot &&
      template.meme_mechanic === "nobody_me_setup"
    ) {
      const fixed = normalizeNobodyMeSetupSlots(slot1Value, slot2Value);
      slot1Value = fixed.top;
      slot2Value = fixed.bottom;
    }
    if (isOneSlotMeme) {
      const raw = slot2Value;
      if (
        raw !== null &&
        raw !== undefined &&
        String(raw).trim() !== ""
      ) {
        console.warn("[meme-gen] stripping invalid bottom text", {
          template: template.slug,
          preview: String(raw).slice(0, 120),
        });
        slot2Value = null;
        p.bottom_text = null;
      }
    }
    const slot3Value = isThreeSlot ? p.slot_3_text : null;
    const namesValidation = namesCount
      ? validateFirstNamesList(p.names, namesCount)
      : { value: null as string[] | null, failRule: null as string | null };

    // Validation: avoid inserting broken rows.
    const titleValidation = isThreeSlot
      ? {
          value: template.template_name.slice(0, TITLE_MAX_CHARS),
          failRule: null as string | null,
          length: template.template_name.slice(0, TITLE_MAX_CHARS).length,
        }
      : validateTitle(p.title);
    const topValidation = validateSlotTextSingleLine(
      slot1Value,
      template.slot_1_max_chars,
      slot1ValidationLabel,
      {
        allowShortLabelMode: allowShortLabelValidationMode(template),
        templateSlug: template.slug,
        templateType: template.template_type,
        isReactionStyleTopCaptionTemplate:
          isReactionStyleTopCaptionTemplate(template),
      }
    );
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

    console.log("[meme-gen] final parsed output", {
      slotType: isThreeSlot
        ? "3-slot"
        : namesCount
          ? "names"
          : template.isTwoSlot
            ? "2-slot"
            : "1-slot",
      top: slot1Value,
      bottom: slot2Value,
    });

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

    if (template.template_family === "engagement_text") {
      const layoutForTop = getEngagementLayoutKey(template);
      let layoutTopFail: string | null = null;
      if (layoutForTop === ENGAGEMENT_LAYOUT_ONE_WORD) {
        layoutTopFail = validateOneWordTopicPhrase(topValidation.value).failRule;
      } else if (layoutForTop === ENGAGEMENT_LAYOUT_AGREE_DISAGREE) {
        layoutTopFail = validateAgreeDisagreeStatement(topValidation.value).failRule;
      } else if (layoutForTop === ENGAGEMENT_LAYOUT_HOT_TAKE) {
        layoutTopFail = validateHotTakeStatement(topValidation.value).failRule;
      } else if (layoutForTop === ENGAGEMENT_LAYOUT_EMOJI_ONLY) {
        layoutTopFail = validateEmojiOnlyTopic(topValidation.value).failRule;
      } else if (layoutForTop === ENGAGEMENT_LAYOUT_FILL_GAP) {
        layoutTopFail = validateFillGapStatement(topValidation.value).failRule;
      }
      if (layoutTopFail) {
        console.error("[meme-gen] Engagement layout-specific top_text validation failed", {
          template: `${template.template_name} (${template.slug})`,
          layout: layoutForTop,
          rule: layoutTopFail,
          top_text: topValidation.value,
        });
        return { result: null, failureRule: layoutTopFail };
      }
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

    if (
      template.template_family === "engagement_text" &&
      getEngagementLayoutKey(template) === ENGAGEMENT_LAYOUT_PICK_ONE &&
      topValidation.value &&
      bottomValidation.value
    ) {
      const pickOneFail = validatePickOneOptions(
        topValidation.value,
        bottomValidation.value
      ).failRule;
      if (pickOneFail) {
        console.error("[meme-gen] Engagement pick_one pair validation failed", {
          template: `${template.template_name} (${template.slug})`,
          rule: pickOneFail,
          top_text: topValidation.value,
          bottom_text: bottomValidation.value,
        });
        return { result: null, failureRule: pickOneFail };
      }
    }

    if (isThreeSlot && structuredThreeSlotDebateMode && bottomValidation.value) {
      const centerSubjectValidation = validateThreeSlotCenterSubject(
        bottomValidation.value
      );
      if (!centerSubjectValidation.value) {
        console.error("[meme-gen] Validation failed", {
          template: `${template.template_name} (${template.slug})`,
          templateType: template.template_type,
          attempt,
          slotType: "3-slot",
          rule: centerSubjectValidation.failRule,
          slot_2_text: bottomValidation.value,
        });
        return {
          result: null,
          failureRule: centerSubjectValidation.failRule ?? "validation_failed",
        };
      }
    }

    if (namesCount && !namesValidation.value) {
      console.error("[meme-gen] Engagement names validation failed", {
        template: `${template.template_name} (${template.slug})`,
        textLayoutType: template.text_layout_type,
        rule: namesValidation.failRule,
        expectedCount: namesCount,
        receivedCount: Array.isArray(p.names) ? p.names.length : null,
      });
      return {
        result: null,
        failureRule: namesValidation.failRule ?? "names_validation_failed",
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
    return {
      result: {
        title: finalTitle,
        top_text: finalTop,
        bottom_text: finalBottom,
        slot_3_text: finalSlot3,
        names: namesValidation.value ?? undefined,
      },
      failureRule: null,
    };
  };

  let insertedCount = 0;
  let failedCount = 0;
  let attemptedCount = 0;
  let qaCaptureResult: QaCapturedGeneratedFields | null = null;

  for (
    let poolIndex = 0;
    poolIndex < candidateTemplates.length &&
    insertedCount < batchSize;
    poolIndex++
  ) {
    const template = candidateTemplates[poolIndex];
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
      promoText: variantType === "promo" ? generationContext.explicitPromoContext : null,
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
    const explicitPromoMode = deriveExplicitPromoMode(template);
    const fallbackReplacementUsed = failedCount > 0;
    const variantMetadata =
      template.template_family === "square_text" || template.template_family === "engagement_text"
        ? variantType === "important_day"
          ? {
              important_day_key: variantContext.importantDayKey,
              important_day_label: variantContext.importantDayLabel,
              media_type: "image" as const,
              output_format: "square_text" as const,
            }
          : {
              media_type: "image" as const,
              output_format: "square_text" as const,
            }
        : variantType === "important_day"
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
          names?: string[];
        }
      | null = null;
    let previousFailureRule: string | null = null;
    const ideaGroupId = randomUUID();

    console.log("[variant-prompt] ", {
      slug: template.slug,
      variantType,
      variantContext,
    });

  console.log("[meme-gen] Attempting template from pool", {
      poolIndex: poolIndex + 1,
      template: template.slug,
      templateType: template.template_type,
      variantType,
      explicitPromoMode,
      fallbackReplacementUsed,
      ultraTightPromptMode: isUltraTightTemplate(template),
      hasExplicitPromoContext: Boolean(explicitPromoContext),
    });

    let attemptUsed = 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptUsed = attempt;
      const generationAttempt = await generateForTemplate(
        template,
        variantContext,
        explicitPromoMode,
        attempt,
        previousFailureRule
      );
      generated = generationAttempt.result;
      previousFailureRule = generationAttempt.failureRule;
      if (generated) break;

      console.error("[meme-gen] Generation failed; retrying", {
        template: template.slug,
        explicitPromoMode,
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
        explicitPromoMode,
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
        nextTemplate: candidateTemplates[poolIndex + 1]?.slug ?? null,
        insertedCount,
        failedCount,
      });
      continue;
    }

    generated = sanitizeGeneratedMemeTextFields(generated);

    if (options?.qaCaptureSanitizedTextOnly) {
      qaCaptureResult = {
        template_slug: template.slug,
        title: generated.title,
        top_text: generated.top_text,
        bottom_text: generated.bottom_text,
        slot_3_text: generated.slot_3_text,
        ...(Array.isArray(generated.names) && generated.names.length > 0
          ? { names: generated.names }
          : {}),
      };
      break;
    }

    let imageUrl: string | null = null;
    try {
      if (template.template_family === "square_text") {
        const pngBuffer = await renderSquareTextMemePng({
          topText: generated.top_text,
          bottomText: generated.bottom_text,
          slot1MaxLines: template.slot_1_max_lines,
          slot2MaxLines: template.isTwoSlot ? template.slot_2_max_lines : 0,
          engagementStyle: "classic",
        });

        const objectPath = `generated_memes/${workspaceContext?.storagePathNamespace ?? actorUserId ?? "anonymous"}/${template.template_id}/${randomUUID()}.png`;
        const { error: uploadError } = await adminSupabase.storage
          .from(generatedMemeBucket)
          .upload(objectPath, pngBuffer, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(uploadError.message || `Failed to upload square text meme`);
        }

        const publicUrlRes = adminSupabase.storage
          .from(generatedMemeBucket)
          .getPublicUrl(objectPath);
        imageUrl = publicUrlRes.data.publicUrl ?? null;
      } else if (template.template_family === "engagement_text") {
        const pngBuffer = await renderEngagementTextMemePng({
          keyword: generated.top_text,
          topText: generated.top_text,
          bottomText: generated.bottom_text,
          names: generated.names,
          template,
          engagementStyle: "classic",
        });

        const objectPath = `generated_memes/${
          workspaceContext?.storagePathNamespace ?? actorUserId ?? "anonymous"
        }/${template.template_id}/${randomUUID()}.png`;

        const { error: uploadError } = await adminSupabase.storage
          .from(generatedMemeBucket)
          .upload(objectPath, pngBuffer, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(
            uploadError.message || `Failed to upload engagement text meme`
          );
        }

        const publicUrlRes = adminSupabase.storage
          .from(generatedMemeBucket)
          .getPublicUrl(objectPath);
        imageUrl = publicUrlRes.data.publicUrl ?? null;
      } else if (template.asset_type === "video") {
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

        const objectPath = `generated_memes/${workspaceContext?.storagePathNamespace ?? actorUserId ?? "anonymous"}/${template.template_id}/${randomUUID()}.mp4`;
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

          const objectPath = `generated_memes/${workspaceContext?.storagePathNamespace ?? actorUserId ?? "anonymous"}/${template.template_id}/${randomUUID()}.png`;

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

    const contentPackMeta =
      options?.contentPack && options?.generationRunIdOverride
        ? {
            content_pack: true as const,
            content_pack_batch: options.contentPack.batch,
            content_pack_run_id: options.generationRunIdOverride,
          }
        : null;
    const workspaceMeta = workspaceContext?.workspaceId
      ? {
          workspace_id: workspaceContext.workspaceId,
        }
      : null;
    const mergedVariantMetadata = {
      ...(variantMetadata as Record<string, unknown>),
      ...(workspaceMeta ?? {}),
      ...(contentPackMeta ?? {}),
      ...(template.template_family === "engagement_text" && Array.isArray(generated.names)
        ? { engagement_names: generated.names }
        : {}),
      ...(template.template_family === "engagement_text"
        ? { engagement_style: "classic" as const }
        : {}),
      ...(outputFormat === "square_text"
        ? { content_template_family: template.template_family }
        : {}),
      ...(template.template_family === "square_text"
        ? { engagement_style: "classic" as const }
        : {}),
      selection_strategy:
        outputFormat === "square_text"
          ? "square_text_open_variant"
          : "random_template",
      workflow_mode: "single_output",
      ...cycleDiagnostics,
      selected_template_id: template.template_id,
      selected_template_slug: template.slug,
    };

    const row = {
      user_id: actorUserId,
      template_id: template.template_id,
      idea_group_id: ideaGroupId,
      title: generated.title,
      format: template.template_name,
      top_text: generated.top_text,
      bottom_text: generated.bottom_text,
      post_caption: null,
      image_url: imageUrl,
      variant_type: variantType,
      generation_run_id: generationContext.generationRunId,
      batch_number: generationContext.batchNumber,
      variant_metadata: mergedVariantMetadata,
    };

    if (!imageUrl) {
      failedCount++;
      console.error("[meme-gen] Skipped template (render produced no media URL)", {
        template: `${template.template_name} (${template.slug})`,
        templateType: template.template_type,
        variantType,
        explicitPromoMode,
        attemptUsed,
      });
      console.log("[meme-gen] Fallback replacement queued", {
        failedTemplate: template.slug,
        nextTemplate: selectedTemplatesForBatch[poolIndex + 1]?.slug ?? null,
        insertedCount,
        failedCount,
      });
      continue;
    }

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

    const writeClient = !user && allowAnonymousWrite ? adminSupabase : supabase;
    const { error: insertError } = await writeClient
      .from("generated_memes")
      .insert(row);

    if (insertError) {
      console.error("[meme-gen] Insert failed", {
        template: template.slug,
        templateType: template.template_type,
        variantType,
        explicitPromoMode,
        row,
        insertError,
      });
      failedCount++;
      console.error("[meme-gen] Skipped template (DB insert failed)", {
        template: `${template.template_name} (${template.slug})`,
        templateType: template.template_type,
        variantType,
        explicitPromoMode,
        attemptUsed,
        slotType: template.isTwoSlot ? "2-slot" : "1-slot",
        wasRetried: attemptUsed > 1,
      });
      console.log("[meme-gen] Fallback replacement queued", {
        failedTemplate: template.slug,
        nextTemplate: selectedTemplatesForBatch[poolIndex + 1]?.slug ?? null,
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
      explicitPromoMode,
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

  if (options?.qaCaptureSanitizedTextOnly) {
    if (!qaCaptureResult) {
      return {
        error: "QA capture failed: no generated text after retries.",
        generationRunId: generationContext.generationRunId,
        qaSanitizedText: null,
      };
    }
    return {
      error: null,
      generationRunId: generationContext.generationRunId,
      qaSanitizedText: qaCaptureResult,
    };
  }

  console.log("[meme-gen] Generation summary", {
    compatibleTemplates: compatibleTemplates.length,
    templatePoolSize: templatePool.length,
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
    console.warn("[meme-gen] No inserts after retries; suppressing hard failure for smooth UX", {
      generationRunId: generationContext.generationRunId,
      attemptedCount,
      failedCount,
      outputFormat,
    });
    return { error: null, generationRunId: generationContext.generationRunId };
  }

  return { error: null, generationRunId: generationContext.generationRunId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : null;
    console.error("[meme-gen] Unhandled generation error", {
      generationContextText,
      options,
      message,
      stack,
      error,
    });
    return { error: "Failed to generate memes. Check server logs for details." };
  }
}

export async function generateMoreMemes(
  outputFormat?: MemeOutputFormat
): Promise<{ error: string | null; generationRunId?: string }> {
  console.error("[legacy-generation] generateMoreMemes called", { outputFormat });
  throw new Error("Legacy generation path no longer supported");
}

export async function regenerateTemplateIdea(
  templateId: string,
  outputFormat?: MemeOutputFormat
): Promise<{ error: string | null; generationRunId?: string }> {
  console.error("[legacy-generation] regenerateTemplateIdea called", {
    templateId,
    outputFormat,
  });
  throw new Error("Legacy generation path no longer supported");
}
