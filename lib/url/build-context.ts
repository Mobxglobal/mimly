import type { EnrichedBusinessProfile } from "@/lib/url/enrich-context";

export function buildPromptFromEnrichment(profile: EnrichedBusinessProfile): string {
  const businessName = String(profile.businessName ?? "").trim();
  const industry = String(profile.industry ?? "").trim();
  const audience = String(profile.audience ?? "").trim();
  const tone = (profile.tone ?? []).map((item) => String(item).trim()).filter(Boolean);
  const painPoints = (profile.painPoints ?? [])
    .map((item) => String(item).trim())
    .filter(Boolean);
  const contentAngles = (profile.contentAngles ?? [])
    .map((item) => String(item).trim())
    .filter(Boolean);

  return [
    businessName ? `Business: ${businessName}` : null,
    industry ? `Industry: ${industry}` : null,
    audience ? `Audience: ${audience}` : null,
    tone.length ? `Tone: ${tone.join(", ")}` : null,
    painPoints.length ? `Pain points: ${painPoints.join("; ")}` : null,
    contentAngles.length ? `Content angles: ${contentAngles.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
