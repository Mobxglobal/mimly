import {
  SLIDESHOW_ASSET_MOODS,
  SLIDESHOW_ASSET_SETTINGS,
  SLIDESHOW_ASSET_SUBJECT_TYPES,
  SLIDESHOW_ASSET_THEMES,
  SLIDESHOW_ASSET_TEXT_OVERLAY,
  SLIDESHOW_VISION_ENUMS,
  type SlideshowAssetMood,
  type SlideshowAssetSetting,
  type SlideshowAssetSubjectType,
  type SlideshowAssetTheme,
  type SlideshowAssetTextOverlay,
  type SlideshowAssetVisionMetadata,
} from "@/lib/memes/slideshow/types";

function normToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const item of value) {
    const t = normToken(String(item ?? ""));
    if (t.length >= 2 && t.length <= 32) out.add(t);
  }
  return [...out].slice(0, 8);
}

/** Shared for vision ingest + slide image_selection parsing (short snake_case tags). */
export function normalizeSlideshowIndustryTags(value: unknown): string[] {
  return normalizeTags(value);
}

function pickEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number]
): T[number] {
  const n = normToken(String(value ?? ""));
  const hit = allowed.find((a) => a === n);
  return (hit ?? fallback) as T[number];
}

/**
 * Map legacy vision / model strings to the current overlay scale.
 * excellent/good -> high/medium; fair/poor -> medium/low.
 */
function coerceTextOverlaySuitability(raw: unknown): SlideshowAssetTextOverlay {
  const n = normToken(String(raw ?? ""));
  if ((SLIDESHOW_ASSET_TEXT_OVERLAY as readonly string[]).includes(n)) {
    return n as SlideshowAssetTextOverlay;
  }
  if (
    n.includes("excellent") ||
    n === "high" ||
    n.includes("great") ||
    n.includes("strong")
  ) {
    return "high";
  }
  if (n.includes("good") || n === "fair" || n.includes("moderate") || n === "medium") {
    return "medium";
  }
  if (n.includes("poor") || n.includes("weak") || n === "low" || n.includes("bad")) {
    return "low";
  }
  /* Default: medium — unknown wording; avoids skewing match scores toward high/low. */
  return "medium";
}

/**
 * Theme: fixed 8-way bucket. Order = more specific first; last resort lifestyle.
 * Default lifestyle — broad bucket for generic stock / ambiguous scenes (documented product choice).
 */
export function coerceSlideshowTheme(raw: unknown): SlideshowAssetTheme {
  const n = normToken(String(raw ?? ""));
  if ((SLIDESHOW_ASSET_THEMES as readonly string[]).includes(n)) {
    return n as SlideshowAssetTheme;
  }
  const hay = n;

  const checks: Array<{ keys: string[]; value: SlideshowAssetTheme }> = [
    { keys: ["stress", "overwhelm", "pressure", "deadline", "panic", "rush"], value: "stress" },
    {
      keys: ["discomfort", "uncomfort", "messy", "chaos", "tense", "awkward", "gross"],
      value: "discomfort",
    },
    {
      keys: ["clean", "tidy", "minimal", "sterile", "organized", "spotless", "neat"],
      value: "cleanliness",
    },
    {
      keys: ["relief", "release", "solved", "win", "ease", "after", "phew"],
      value: "relief",
    },
    {
      keys: ["productiv", "efficient", "workflow", "focus", "deadline_met", "deepwork"],
      value: "productivity",
    },
    {
      keys: ["luxury", "premium", "elegant", "high_end", "opulent", "boutique", "vip"],
      value: "luxury",
    },
    {
      keys: ["comfort", "cozy", "relax", "restful", "soft", "ease", "warmth"],
      value: "comfort",
    },
    {
      keys: ["lifestyle", "daily", "routine", "everyday", "life", "moment", "culture"],
      value: "lifestyle",
    },
  ];

  for (const { keys, value } of checks) {
    if (keys.some((k) => hay.includes(k))) return value;
  }

  /* Work/office without clearer signal → productivity */
  if (hay.includes("work") || hay.includes("office") || hay.includes("desk")) {
    return "productivity";
  }
  if (hay.includes("home") || hay.includes("living") || hay.includes("kitchen")) {
    return "comfort";
  }

  return "lifestyle";
}

/**
 * Default calm — emotionally neutral when the model returns unknown labels (e.g. old "neutral").
 */
export function coerceSlideshowMood(raw: unknown): SlideshowAssetMood {
  const n = normToken(String(raw ?? ""));
  if ((SLIDESHOW_ASSET_MOODS as readonly string[]).includes(n)) {
    return n as SlideshowAssetMood;
  }
  const map: Record<string, SlideshowAssetMood> = {
    neutral: "calm",
    upbeat: "warm",
    playful: "warm",
    cozy: "warm",
    tense: "frustrated",
    serious: "serious",
    dramatic: "serious",
    hopeful: "aspirational",
    absurd: "frustrated",
    calm: "calm",
    warm: "warm",
    cool: "cool",
    frustrated: "frustrated",
    aspirational: "aspirational",
    professional: "serious",
    corporate: "serious",
    angry: "frustrated",
    annoyed: "frustrated",
    cold: "cool",
    minimalist: "cool",
  };
  if (map[n]) return map[n];
  if (n.includes("frustrat") || n.includes("stress") || n.includes("annoy")) return "frustrated";
  if (n.includes("aspir") || n.includes("dream") || n.includes("lux")) return "aspirational";
  if (n.includes("warm") || n.includes("soft") || n.includes("friendly")) return "warm";
  if (n.includes("cool") || n.includes("cold") || n.includes("sleek")) return "cool";
  if (n.includes("serious") || n.includes("formal")) return "serious";
  return "calm";
}

/**
 * Default commercial_interior — indoor non-residential when unmappable.
 */
export function coerceSlideshowSetting(raw: unknown): SlideshowAssetSetting {
  const n = normToken(String(raw ?? ""));
  if ((SLIDESHOW_ASSET_SETTINGS as readonly string[]).includes(n)) {
    return n as SlideshowAssetSetting;
  }
  const map: Record<string, SlideshowAssetSetting> = {
    home: "home_interior",
    house: "home_interior",
    indoor_home: "home_interior",
    living_room: "home_interior",
    kitchen: "home_interior",
    bedroom: "home_interior",
    outdoor_nature: "outdoor_urban",
    retail: "commercial_interior",
    shop: "commercial_interior",
    store: "commercial_interior",
    mall: "commercial_interior",
    cafe: "commercial_interior",
    restaurant: "commercial_interior",
    studio: "commercial_interior",
    abstract: "commercial_interior",
    event: "commercial_interior",
    other: "commercial_interior",
    outdoor_urban: "outdoor_urban",
    urban: "outdoor_urban",
    street: "outdoor_urban",
    city: "outdoor_urban",
    office: "office",
    workspace: "office",
    outdoor: "outdoor_urban",
    yard: "home_exterior",
    garden: "home_exterior",
    porch: "home_exterior",
    facade: "home_exterior",
  };
  if (map[n]) return map[n];
  if (n.includes("home") && (n.includes("out") || n.includes("yard") || n.includes("garden"))) {
    return "home_exterior";
  }
  if (n.includes("home") || n.includes("living") || n.includes("kitchen")) return "home_interior";
  if (n.includes("office") || n.includes("desk") || n.includes("corporate")) return "office";
  if (n.includes("outdoor") || n.includes("street") || n.includes("urban")) return "outdoor_urban";
  if (n.includes("retail") || n.includes("store") || n.includes("lobby")) return "commercial_interior";
  return "commercial_interior";
}

/**
 * Default environment — scene-first when subject not clearly person/product/detail.
 */
export function coerceSlideshowSubjectType(raw: unknown): SlideshowAssetSubjectType {
  const n = normToken(String(raw ?? ""));
  if ((SLIDESHOW_ASSET_SUBJECT_TYPES as readonly string[]).includes(n)) {
    return n as SlideshowAssetSubjectType;
  }
  const map: Record<string, SlideshowAssetSubjectType> = {
    people: "person",
    single_person: "person",
    person: "person",
    hands: "detail",
    object: "product",
    food: "detail",
    workspace: "environment",
    landscape: "environment",
    urban: "environment",
    abstract: "environment",
    animal: "detail",
    other: "environment",
    product: "product",
    environment: "environment",
    detail: "detail",
  };
  if (map[n]) return map[n];
  if (n.includes("person") || n.includes("people") || n.includes("face") || n.includes("portrait")) {
    return "person";
  }
  if (n.includes("product") || n.includes("package") || n.includes("device")) return "product";
  if (n.includes("close") || n.includes("macro") || n.includes("hand") || n.includes("texture")) {
    return "detail";
  }
  return "environment";
}

function pickColorProfile(value: unknown): string {
  return pickEnum(value, SLIDESHOW_VISION_ENUMS.color_profile, "neutral");
}

/**
 * Normalize vision/LLM JSON into DB-safe slideshow_image_assets fields (controlled vocabulary).
 */
export function normalizeSlideshowAssetVisionMetadata(
  raw: Record<string, unknown>
): SlideshowAssetVisionMetadata {
  const theme = coerceSlideshowTheme(raw.theme);
  const mood = coerceSlideshowMood(raw.mood);
  const setting = coerceSlideshowSetting(raw.setting);
  const subject_type = coerceSlideshowSubjectType(raw.subject_type);

  const summary = String(raw.summary ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  const notes = String(raw.notes ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  return {
    theme,
    mood,
    setting,
    subject_type,
    industry_tags: normalizeTags(raw.industry_tags),
    color_profile: pickColorProfile(raw.color_profile),
    text_overlay_suitability: coerceTextOverlaySuitability(raw.text_overlay_suitability),
    layout_a_fit: clampInt(Number(raw.layout_a_fit), 0, 10),
    layout_b_fit: clampInt(Number(raw.layout_b_fit), 0, 10),
    summary,
    notes,
  };
}

/** For slideshow generation image_selection — same coercion as assets for deterministic matching. */
export function coerceSlideshowCriteriaStrings(params: {
  theme?: unknown;
  mood?: unknown;
  setting?: unknown;
  subject_type?: unknown;
  color_profile?: unknown;
  /** Legacy alias for color_profile (older model output). */
  color_preference?: unknown;
}): {
  theme: string;
  mood: string;
  setting: string;
  subject_type: string;
  color_profile: string;
} {
  return {
    theme: coerceSlideshowTheme(params.theme),
    mood: coerceSlideshowMood(params.mood),
    setting: coerceSlideshowSetting(params.setting),
    subject_type: coerceSlideshowSubjectType(params.subject_type),
    color_profile: pickColorProfile(
      params.color_profile ?? params.color_preference
    ),
  };
}
