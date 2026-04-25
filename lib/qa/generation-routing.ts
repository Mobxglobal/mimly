import type { MemeOutputFormat } from "@/lib/memes/meme-output-formats";

export type QaGenerationRouting = {
  outputFormat: MemeOutputFormat;
  templateFamilyPreference: "engagement_text" | null;
};

export function deriveGenerationRoutingForRow(row: Record<string, unknown>): QaGenerationRouting | null {
  const family = String(row.template_family ?? "square_meme").trim();
  if (family === "vertical_slideshow") return null;

  if (family === "square_text") {
    return { outputFormat: "square_text", templateFamilyPreference: null };
  }
  if (family === "engagement_text") {
    return { outputFormat: "square_text", templateFamilyPreference: "engagement_text" };
  }

  const assetType = String(row.asset_type ?? "image").trim().toLowerCase();
  if (assetType === "video") {
    return { outputFormat: "square_video", templateFamilyPreference: null };
  }
  return { outputFormat: "square_image", templateFamilyPreference: null };
}
