export type EnrichedBusinessProfile = {
  businessName: string;
  industry: string;
  tone: string[];
  audience: string;
  painPoints: string[];
  contentAngles: string[];
};

type MetadataInput = {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  h1?: string;
};

function toWords(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function pickBusinessName(input: MetadataInput): string {
  const candidates = [input.ogTitle, input.title, input.h1, input.description]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (candidates.length === 0) return "Your business";
  return candidates[0]!.slice(0, 120);
}

function inferIndustry(text: string): string {
  const value = text.toLowerCase();
  if (/\bplumb|heating|hvac|roof|electric/.test(value)) return "home services";
  if (/\bdent|clinic|medical|health/.test(value)) return "healthcare";
  if (/\bsaas|software|app|platform|tech/.test(value)) return "software";
  if (/\bshop|retail|ecom|store/.test(value)) return "retail";
  if (/\bgym|fitness|coach|wellness/.test(value)) return "fitness";
  return "general business";
}

export async function enrichContext(input: MetadataInput): Promise<EnrichedBusinessProfile> {
  const title = String(input.title ?? "").trim();
  const description = String(input.description ?? "").trim();
  const ogTitle = String(input.ogTitle ?? "").trim();
  const ogDescription = String(input.ogDescription ?? "").trim();
  const h1 = String(input.h1 ?? "").trim();
  const merged = [title, description, ogTitle, ogDescription, h1]
    .filter(Boolean)
    .join(" ");

  const tokens = toWords(merged);
  const topTokens = [...new Set(tokens)].slice(0, 6);

  return {
    businessName: pickBusinessName(input),
    industry: inferIndustry(merged),
    tone: ["relatable", "direct"],
    audience: "people likely to buy this service",
    painPoints: [
      "standing out online",
      "earning trust quickly",
      "converting attention into enquiries",
    ],
    contentAngles: topTokens.length
      ? topTokens.map((token) => `relatable moments around ${token}`)
      : ["relatable customer moments", "common industry frustrations"],
  };
}

export function isValidBusinessProfile(
  profile: EnrichedBusinessProfile | null | undefined
): profile is EnrichedBusinessProfile {
  if (!profile) return false;
  return (
    String(profile.businessName ?? "").trim().length >= 2 &&
    String(profile.industry ?? "").trim().length >= 2 &&
    String(profile.audience ?? "").trim().length >= 2 &&
    Array.isArray(profile.tone) &&
    Array.isArray(profile.painPoints) &&
    Array.isArray(profile.contentAngles)
  );
}

export function finalizeProfileAfterUrlEnrichment(
  enriched: EnrichedBusinessProfile,
  metadata: MetadataInput
): EnrichedBusinessProfile {
  const businessName = pickBusinessName(metadata);
  return {
    ...enriched,
    businessName: businessName || enriched.businessName || "Your business",
    industry: String(enriched.industry ?? "").trim() || "general business",
    audience:
      String(enriched.audience ?? "").trim() || "people likely to buy this service",
    tone: enriched.tone?.length ? enriched.tone : ["relatable", "direct"],
    painPoints: enriched.painPoints?.length
      ? enriched.painPoints
      : ["standing out online", "earning trust quickly"],
    contentAngles: enriched.contentAngles?.length
      ? enriched.contentAngles
      : ["relatable customer moments", "common industry frustrations"],
  };
}
