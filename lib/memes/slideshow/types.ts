/**
 * Types for vertical_slideshow templates, LLM output, asset library rows, and persisted variant_metadata.
 */

export type SlideshowLayoutVariant = "layout_a" | "layout_b";

export type TemplateFamily = "square_meme" | "vertical_slideshow";

/** Stored on meme_templates.slideshow_config (jsonb). */
export type SlideshowTemplateConfig = {
  layout_a_max_chars?: number;
  layout_b_max_chars?: number;
  layout_a_max_lines?: number;
  layout_b_max_lines?: number;
  font_family?: string;
  font_size_layout_a?: number;
  font_size_layout_b?: number;
  text_color?: string;
  stroke_color?: string;
  stroke_width?: number;
};

export const DEFAULT_SLIDESHOW_CONFIG: Required<
  Pick<
    SlideshowTemplateConfig,
    | "layout_a_max_chars"
    | "layout_b_max_chars"
    | "layout_a_max_lines"
    | "layout_b_max_lines"
    | "font_family"
    | "font_size_layout_a"
    | "font_size_layout_b"
    | "text_color"
    | "stroke_color"
    | "stroke_width"
  >
> = {
  /** ~680px column + 68px type; 26+ allows strong 2-line setup+punch (e.g. sentence on line 1). */
  layout_a_max_chars: 26,
  layout_b_max_chars: 34,
  layout_a_max_lines: 3,
  layout_b_max_lines: 4,
  font_family:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  /** Text A (upper band). Kept in sync with `font_size_layout_b` by default so every slide uses one type size. */
  font_size_layout_a: 68,
  /** Text B (middle band). Defaults match `font_size_layout_a` for consistent typography across layout variants. */
  font_size_layout_b: 68,
  text_color: "#FFFFFF",
  stroke_color: "#0a0a0a",
  stroke_width: 5,
};

/** Criteria emitted by slideshow LLM per slide; used to pick a library image. */
export type SlideshowImageSelectionCriteria = {
  theme?: string | null;
  mood?: string | null;
  setting?: string | null;
  subject_type?: string | null;
  industry_tags?: string[] | null;
  /** Matches slideshow_image_assets.color_profile (controlled enum). */
  color_profile?: string | null;
  /** @deprecated Legacy LLM key; matching still honors this if present on old rows. */
  color_preference?: string | null;
  /** Prefer assets whose layout_*_fit meets this threshold (0–10). */
  min_layout_fit_score?: number | null;
};

/** Normalized row shape for matching (from DB or script). */
export type SlideshowImageAssetRecord = {
  id: string;
  storage_path: string;
  public_url: string | null;
  theme: string | null;
  mood: string | null;
  setting: string | null;
  subject_type: string | null;
  industry_tags: string[];
  color_profile: string | null;
  text_overlay_suitability: string | null;
  layout_a_fit: number | null;
  layout_b_fit: number | null;
  summary: string | null;
};

/** Raw LLM output for slideshow generation (before validation). */
export type SlideshowLlmSlideDraft = {
  role?: unknown;
  text?: unknown;
  layout_variant?: unknown;
  image_selection?: unknown;
};

export type SlideshowLlmOutputDraft = {
  slide_count?: unknown;
  slideshow_intent?: unknown;
  slides?: unknown;
  post_caption?: unknown;
};

/** Validated slide (generation pipeline). */
export type ValidatedSlideshowSlide = {
  role: string;
  text: string;
  layout_variant: SlideshowLayoutVariant;
  image_selection: SlideshowImageSelectionCriteria;
};

export type ValidatedSlideshowPayload = {
  slide_count: 3 | 4 | 5;
  slideshow_intent: string;
  slides: ValidatedSlideshowSlide[];
  post_caption: string;
};

/** Persisted inside generated_memes.variant_metadata for slideshow rows. */
export type SlideshowVariantMetadata = {
  media_type: "slideshow";
  output_format: "vertical_slideshow";
  slide_count: 3 | 4 | 5;
  slideshow_intent: string;
  slides: Array<{
    index: number;
    role: string;
    text: string;
    layout_variant: SlideshowLayoutVariant;
    image_asset_id: string;
    image_storage_path: string;
    image_url: string;
    image_selection: SlideshowImageSelectionCriteria;
  }>;
};

/** Vision ingestion: normalized metadata for slideshow_image_assets. */
export type SlideshowAssetVisionMetadata = {
  theme: string;
  mood: string;
  setting: string;
  subject_type: string;
  industry_tags: string[];
  color_profile: string;
  text_overlay_suitability: string;
  layout_a_fit: number;
  layout_b_fit: number;
  summary: string;
  notes: string;
};

/** Per-slide roles; order must match slide index for each slide_count. */
export const SLIDESHOW_ROLE_LADDERS: Record<3 | 4 | 5, readonly string[]> = {
  3: ["hook", "turn", "payoff"],
  4: ["hook", "build", "turn", "payoff"],
  5: ["hook", "build", "build", "turn", "payoff"],
} as const;

/** Curated asset + matching vocabulary (ingestion vision + slideshow image_selection). */
export const SLIDESHOW_ASSET_THEMES = [
  "comfort",
  "discomfort",
  "luxury",
  "productivity",
  "cleanliness",
  "stress",
  "relief",
  "lifestyle",
] as const;

export const SLIDESHOW_ASSET_MOODS = [
  "calm",
  "warm",
  "cool",
  "serious",
  "aspirational",
  "frustrated",
] as const;

export const SLIDESHOW_ASSET_SETTINGS = [
  "home_interior",
  "home_exterior",
  "office",
  "outdoor_urban",
  "commercial_interior",
] as const;

export const SLIDESHOW_ASSET_SUBJECT_TYPES = [
  "environment",
  "person",
  "product",
  "detail",
] as const;

export const SLIDESHOW_ASSET_TEXT_OVERLAY = ["high", "medium", "low"] as const;

export type SlideshowAssetTheme = (typeof SLIDESHOW_ASSET_THEMES)[number];
export type SlideshowAssetMood = (typeof SLIDESHOW_ASSET_MOODS)[number];
export type SlideshowAssetSetting = (typeof SLIDESHOW_ASSET_SETTINGS)[number];
export type SlideshowAssetSubjectType = (typeof SLIDESHOW_ASSET_SUBJECT_TYPES)[number];
export type SlideshowAssetTextOverlay = (typeof SLIDESHOW_ASSET_TEXT_OVERLAY)[number];

/** Used by vision normalization; color stays on the older 6-value scale for lighting matching. */
export const SLIDESHOW_VISION_ENUMS = {
  theme: SLIDESHOW_ASSET_THEMES,
  mood: SLIDESHOW_ASSET_MOODS,
  setting: SLIDESHOW_ASSET_SETTINGS,
  subject_type: SLIDESHOW_ASSET_SUBJECT_TYPES,
  color_profile: ["warm", "cool", "neutral", "high_contrast", "muted", "monochrome"] as const,
  text_overlay_suitability: SLIDESHOW_ASSET_TEXT_OVERLAY,
} as const;
