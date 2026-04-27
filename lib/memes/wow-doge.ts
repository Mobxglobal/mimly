type WowDogePromptParams = {
  businessName?: string | null;
  industry?: string | null;
  audience?: string | null;
  contextSummary?: string | null;
  userPrompt?: string | null;
};

const WOW_DOGE_SLUG = "wow-doge";

/**
 * Legacy helper retained for backwards-compatible imports.
 * Runtime selection currently excludes wow-doge, so this is defensive only.
 */
export function isWowDogeTemplateSlug(slug: unknown): boolean {
  return String(slug ?? "").trim().toLowerCase() === WOW_DOGE_SLUG;
}

/** Legacy prompt supplement retained for compatibility. */
export function getWowDogeRetrySupplement(_previousFailureRule: string | null): string {
  return "";
}

/** Legacy prompt block retained for compatibility. */
export function buildWowDogeUserPromptBlock(params: WowDogePromptParams): string {
  const parts = [
    String(params.businessName ?? "").trim(),
    String(params.industry ?? "").trim(),
    String(params.audience ?? "").trim(),
    String(params.contextSummary ?? "").trim(),
    String(params.userPrompt ?? "").trim(),
  ].filter(Boolean);
  return parts.join(" | ");
}

/** Legacy validator retained for compatibility. */
export function validateWowDogePhrases(input: unknown): {
  phrases: string[] | null;
  failRule: string | null;
} {
  if (!Array.isArray(input)) {
    return { phrases: null, failRule: "wow_doge_phrases_missing" };
  }
  const phrases = input
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 5);
  if (phrases.length === 0) {
    return { phrases: null, failRule: "wow_doge_phrases_missing" };
  }
  return { phrases, failRule: null };
}
