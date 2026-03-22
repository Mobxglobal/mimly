export type GenerationMode = "content_pack" | "on_demand";

export const ONBOARDING_SESSION_DRAFT_KEY = "mimly_onboarding_draft_v1";

export type OnboardingSessionDraft = {
  email: string;
  brand_name: string;
  what_you_do: string;
  audience: string;
  country: string;
};

export function normalizeGenerationMode(
  value: unknown
): GenerationMode | null {
  if (value === "content_pack" || value === "on_demand") return value;
  return null;
}

/** Existing profiles and unknown values → default dashboard behavior. */
export function dashboardGenerationMode(
  value: string | null | undefined
): GenerationMode {
  return value === "content_pack" ? "content_pack" : "on_demand";
}
