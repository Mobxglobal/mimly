import { createWorkspaceAdminClient } from "@/lib/workspace/auth";
import { buildPromptFromEnrichment } from "@/lib/url/build-context";
import {
  enrichContext,
  finalizeProfileAfterUrlEnrichment,
  type EnrichedBusinessProfile,
  isValidBusinessProfile,
} from "@/lib/url/enrich-context";

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export { finalizeProfileAfterUrlEnrichment, isValidBusinessProfile } from "@/lib/url/enrich-context";

export type AngleState = {
  currentIndex: number;
};

export function getAngleState(metadata: unknown): AngleState {
  if (
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    "angleState" in metadata
  ) {
    const raw = (metadata as Record<string, unknown>).angleState;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const n = Number((raw as Record<string, unknown>).currentIndex);
      if (Number.isFinite(n) && n >= 0) {
        return { currentIndex: Math.floor(n) };
      }
    }
  }
  return { currentIndex: 0 };
}

export function getNextAngle(
  profile: { contentAngles?: unknown } | null | undefined,
  metadata: unknown
): { angle: string | null; nextState: AngleState | null } {
  const angles = Array.isArray(profile?.contentAngles)
    ? (profile!.contentAngles as unknown[])
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    : [];
  if (!angles.length) {
    return { angle: null, nextState: null };
  }
  const state = getAngleState(metadata);
  const index = state.currentIndex % angles.length;
  return {
    angle: angles[index] ?? null,
    nextState: { currentIndex: state.currentIndex + 1 },
  };
}

export function fallbackBusinessProfileFromPrompt(prompt: string): EnrichedBusinessProfile {
  const name = String(prompt ?? "").trim().slice(0, 200) || "Workspace";
  return {
    businessName: name,
    industry: "general business",
    tone: ["relatable", "engaging"],
    audience: "general customers",
    painPoints: ["standing out online", "inconsistent growth"],
    contentAngles: [
      "relatable customer moments",
      "myth vs reality in the space",
      "quick tips that save time",
      "before and after transformations",
    ],
  };
}

export function finalizeProfileAfterPromptEnrichment(
  enriched: EnrichedBusinessProfile,
  prompt: string
): EnrichedBusinessProfile {
  let profile = isValidBusinessProfile(enriched)
    ? enriched
    : fallbackBusinessProfileFromPrompt(prompt);
  if (!String(profile.businessName ?? "").trim()) {
    profile = fallbackBusinessProfileFromPrompt(prompt);
  }
  return profile;
}

export async function resolveBusinessProfileFromUserText(
  text: string
): Promise<EnrichedBusinessProfile> {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return fallbackBusinessProfileFromPrompt("");
  const enriched = await enrichContext({
    title: trimmed,
    description: trimmed,
  });
  return finalizeProfileAfterPromptEnrichment(enriched, trimmed);
}

export function mergeWorkspaceMetadataWithBusinessProfile(
  existingMetadata: unknown,
  profile: EnrichedBusinessProfile
): Record<string, unknown> {
  const base =
    existingMetadata &&
    typeof existingMetadata === "object" &&
    !Array.isArray(existingMetadata)
      ? { ...(existingMetadata as Record<string, unknown>) }
      : {};
  return {
    ...base,
    businessProfile: profile as unknown as Record<string, unknown>,
    angleState: { currentIndex: 0 },
  };
}

export async function persistWorkspaceBusinessProfile(
  workspaceId: string,
  existingMetadata: unknown,
  profile: EnrichedBusinessProfile,
  options?: { businessSummaryOverride?: string | null }
): Promise<void> {
  const admin = createWorkspaceAdminClient();
  const metadata = mergeWorkspaceMetadataWithBusinessProfile(existingMetadata, profile);
  const summaryOverride = String(options?.businessSummaryOverride ?? "").trim();
  await admin
    .schema("public")
    .from("workspaces")
    .update({
      metadata: metadata as Json,
      business_summary: summaryOverride || profile.businessName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);
}

export function parseBusinessProfileFromWorkspaceRow(workspace: {
  metadata?: unknown;
}): EnrichedBusinessProfile | null {
  const metadata = workspace.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).businessProfile;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const businessName = String(value.businessName ?? "").trim();
  if (businessName.length < 2) return null;
  const toStrings = (input: unknown): string[] =>
    Array.isArray(input)
      ? input.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
  return {
    businessName,
    industry: String(value.industry ?? "").trim(),
    tone: toStrings(value.tone),
    audience: String(value.audience ?? "").trim(),
    painPoints: toStrings(value.painPoints),
    contentAngles: toStrings(value.contentAngles),
  };
}

export function workspaceContextSummaryForJob(
  resetContext: boolean,
  profile: EnrichedBusinessProfile | null,
  workspace: { business_summary?: unknown; initial_prompt?: unknown }
): string | null {
  if (resetContext) return null;
  if (profile) return buildPromptFromEnrichment(profile);
  return (
    String(workspace.business_summary ?? workspace.initial_prompt ?? "").trim() || null
  );
}
