import type { MemeOutputFormat } from "@/lib/memes/meme-output-formats";

type TemplateRow = Record<string, unknown>;

function isActiveTemplate(template: TemplateRow): boolean {
  if (typeof template.is_active === "boolean") return template.is_active;
  if (typeof template.active === "boolean") return template.active;
  if (typeof template.status === "string") {
    return template.status.toLowerCase() === "active";
  }
  return true;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function pickTemplateSimple(
  outputFormat: MemeOutputFormat,
  templates: TemplateRow[],
  templateSlug?: string
): TemplateRow {
  const active = templates.filter(isActiveTemplate);
  const forcedSlug = String(templateSlug ?? "").trim().toLowerCase();

  if (forcedSlug) {
    const forced = active.find(
      (template) => String(template.slug ?? "").trim().toLowerCase() === forcedSlug
    );
    if (!forced) {
      throw new Error(`Template not found for slug: ${templateSlug}`);
    }
    return forced;
  }

  const compatible = active.filter((template) => {
    const assetType = String(template.asset_type ?? "image").toLowerCase();
    const templateFamily = String(template.template_family ?? "").toLowerCase();

    if (outputFormat === "square_video") {
      return assetType === "video";
    }

    if (outputFormat === "square_text") {
      return templateFamily === "square_text" || templateFamily === "engagement_text";
    }

    if (outputFormat === "square_image") {
      return assetType !== "video" && templateFamily !== "square_text";
    }

    return false;
  });

  if (compatible.length === 0) {
    throw new Error(`No active templates found for format "${outputFormat}".`);
  }

  return pickRandom(compatible);
}
