import { wrapSlideshowVerticalLines } from "@/renderer/caption-wrap";
import {
  coerceSlideshowCriteriaStrings,
  normalizeSlideshowIndustryTags,
} from "@/lib/memes/slideshow/slideshow-asset-metadata";
import {
  SLIDESHOW_ROLE_LADDERS,
  type SlideshowImageSelectionCriteria,
  type SlideshowLayoutVariant,
  type SlideshowLlmOutputDraft,
  type ValidatedSlideshowPayload,
  type ValidatedSlideshowSlide,
} from "@/lib/memes/slideshow/types";
import type { SlideshowTemplateConfig } from "@/lib/memes/slideshow/types";
import { DEFAULT_SLIDESHOW_CONFIG } from "@/lib/memes/slideshow/types";

const POST_CAPTION_MAX = 220;

function normalizeSingleLine(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function endsWithDanglingConnector(text: string): boolean {
  return /\b(the|a|an|for|on|in|to|of|with|when|where|why|then|if|while|because|before|after|into|from|at|by|and|or|but|so)\b$/i.test(
    text
  );
}

function looksLikeCutOffFragment(text: string, maxChars: number): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const endsWithPunctuation = /[.!?]$/.test(trimmed);
  if (trimmed.length >= Math.max(10, maxChars - 2) && !endsWithPunctuation) {
    return true;
  }
  if (endsWithDanglingConnector(trimmed)) return true;
  if (trimmed.length < 4) return true;
  return false;
}

function mergedConfig(
  raw: SlideshowTemplateConfig | null | undefined
): typeof DEFAULT_SLIDESHOW_CONFIG {
  return {
    ...DEFAULT_SLIDESHOW_CONFIG,
    ...(raw ?? {}),
  };
}

function parseImageSelection(raw: unknown): SlideshowImageSelectionCriteria {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const minRaw = o.min_layout_fit_score;
  const min_layout_fit_score =
    typeof minRaw === "number" && Number.isFinite(minRaw)
      ? Math.max(0, Math.min(10, Math.round(minRaw)))
      : null;

  const coerced = coerceSlideshowCriteriaStrings({
    theme: o.theme,
    mood: o.mood,
    setting: o.setting,
    subject_type: o.subject_type,
    color_profile: o.color_profile,
    color_preference: o.color_preference,
  });

  return {
    theme: coerced.theme,
    mood: coerced.mood,
    setting: coerced.setting,
    subject_type: coerced.subject_type,
    industry_tags: normalizeSlideshowIndustryTags(o.industry_tags).slice(0, 6),
    color_profile: coerced.color_profile,
    min_layout_fit_score,
  };
}

function isLayoutVariant(v: unknown): v is SlideshowLayoutVariant {
  return v === "layout_a" || v === "layout_b";
}

/** Disallow em dash (—) and en dash (–) in on-slide copy; keeps TikTok-native punctuation. */
function containsForbiddenSlideshowDash(text: string): boolean {
  return /[\u2014\u2013]/.test(text);
}

function validateSlideTextAgainstLayout(
  text: string,
  layout: SlideshowLayoutVariant,
  config: typeof DEFAULT_SLIDESHOW_CONFIG
): { ok: true } | { ok: false; rule: string } {
  if (containsForbiddenSlideshowDash(text)) {
    return { ok: false, rule: "slide_text_forbidden_em_or_en_dash" };
  }

  const maxChars =
    layout === "layout_a"
      ? config.layout_a_max_chars
      : config.layout_b_max_chars;
  const maxLines =
    layout === "layout_a"
      ? config.layout_a_max_lines
      : config.layout_b_max_lines;

  const lines = wrapSlideshowVerticalLines(text, maxChars, maxLines);
  if (lines.length > maxLines) {
    return { ok: false, rule: "slide_text_too_many_lines" };
  }
  if (lines.some((line) => line.length > maxChars)) {
    return { ok: false, rule: "slide_text_line_over_max_chars" };
  }
  const budget = maxChars * maxLines;
  if (text.replace(/\r?\n/g, " ").trim().length > budget) {
    return { ok: false, rule: "slide_text_too_long" };
  }
  if (looksLikeCutOffFragment(text, budget)) {
    return { ok: false, rule: "slide_text_fragment" };
  }
  return { ok: true };
}

export type SlideshowValidationResult =
  | { ok: true; value: ValidatedSlideshowPayload }
  | { ok: false; failureRule: string };

export function validateSlideshowLlmOutput(
  parsed: unknown,
  templateSlideshowConfig: SlideshowTemplateConfig | null | undefined
): SlideshowValidationResult {
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, failureRule: "json_not_object" };
  }

  const p = parsed as SlideshowLlmOutputDraft;
  const count = Number(p.slide_count);
  if (count !== 3 && count !== 4 && count !== 5) {
    return { ok: false, failureRule: "slide_count_invalid" };
  }

  const ladder = SLIDESHOW_ROLE_LADDERS[count as 3 | 4 | 5];
  if (!Array.isArray(p.slides) || p.slides.length !== count) {
    return { ok: false, failureRule: "slides_length_mismatch" };
  }

  const intent = normalizeSingleLine(p.slideshow_intent);
  if (!intent || intent.length < 8) {
    return { ok: false, failureRule: "slideshow_intent_invalid" };
  }
  if (containsForbiddenSlideshowDash(intent)) {
    return { ok: false, failureRule: "slideshow_intent_forbidden_em_or_en_dash" };
  }

  const postCaptionRaw =
    typeof p.post_caption === "string"
      ? p.post_caption
          .replace(/\r?\n/g, " ")
          .replace(/\s+/g, " ")
          .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
          .trim()
      : "";
  if (!postCaptionRaw || postCaptionRaw.length > POST_CAPTION_MAX) {
    return { ok: false, failureRule: "post_caption_invalid" };
  }
  if (containsForbiddenSlideshowDash(postCaptionRaw)) {
    return { ok: false, failureRule: "post_caption_forbidden_em_or_en_dash" };
  }

  const config = mergedConfig(templateSlideshowConfig);
  const slides: ValidatedSlideshowSlide[] = [];

  for (let i = 0; i < count; i++) {
    const s = p.slides[i];
    if (!s || typeof s !== "object") {
      return { ok: false, failureRule: `slide_${i}_invalid` };
    }
    const o = s as Record<string, unknown>;
    const role = normTokenRole(o.role);
    if (role !== ladder[i]) {
      return { ok: false, failureRule: `slide_${i}_role_order` };
    }
    const text = normalizeSingleLine(o.text);
    if (!text) {
      return { ok: false, failureRule: `slide_${i}_text_missing` };
    }
    if (!isLayoutVariant(o.layout_variant)) {
      return { ok: false, failureRule: `slide_${i}_layout_invalid` };
    }
    const layout = o.layout_variant;
    const check = validateSlideTextAgainstLayout(text, layout, config);
    if (!check.ok) {
      return { ok: false, failureRule: `${check.rule}_slide_${i}` };
    }
    const image_selection = parseImageSelection(o.image_selection);
    slides.push({
      role,
      text,
      layout_variant: layout,
      image_selection,
    });
  }

  return {
    ok: true,
    value: {
      slide_count: count as 3 | 4 | 5,
      slideshow_intent: intent.slice(0, 400),
      slides,
      post_caption: postCaptionRaw,
    },
  };
}

function normTokenRole(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}
