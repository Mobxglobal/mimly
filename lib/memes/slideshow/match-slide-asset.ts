import type {
  SlideshowImageAssetRecord,
  SlideshowImageSelectionCriteria,
  SlideshowLayoutVariant,
} from "@/lib/memes/slideshow/types";

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function tagOverlap(a: string[], b: string[]): number {
  const setA = new Set(a.map(norm).filter(Boolean));
  let n = 0;
  for (const t of b) {
    if (setA.has(norm(t))) n++;
  }
  return n;
}

/**
 * Deterministic score: higher is better. Simple weighted overlap on controlled vocabulary.
 */
export function scoreSlideshowAssetMatch(
  criteria: SlideshowImageSelectionCriteria,
  layout: SlideshowLayoutVariant,
  asset: SlideshowImageAssetRecord
): number {
  let score = 0;

  const t = norm(criteria.theme);
  if (t && norm(asset.theme) === t) score += 5;
  if (t && norm(asset.theme).includes(t)) score += 2;

  const mood = norm(criteria.mood);
  if (mood && norm(asset.mood) === mood) score += 4;

  const setting = norm(criteria.setting);
  if (setting && norm(asset.setting) === setting) score += 3;

  const subj = norm(criteria.subject_type);
  if (subj && norm(asset.subject_type) === subj) score += 3;

  const tags = (criteria.industry_tags ?? []).map(norm).filter(Boolean);
  score += tagOverlap(asset.industry_tags, tags) * 2;

  const color = norm(criteria.color_profile ?? criteria.color_preference);
  if (color && norm(asset.color_profile) === color) score += 2;

  const minFit =
    typeof criteria.min_layout_fit_score === "number" &&
    Number.isFinite(criteria.min_layout_fit_score)
      ? Math.max(0, Math.min(10, Math.round(criteria.min_layout_fit_score)))
      : null;

  const fit =
    layout === "layout_a" ? asset.layout_a_fit : asset.layout_b_fit;
  if (fit != null) {
    score += fit;
    if (minFit != null && fit < minFit) score -= 6;
  }

  const suit = norm(asset.text_overlay_suitability);
  if (suit === "high") score += 2;
  else if (suit === "medium") score += 1;
  else if (suit === "low") score -= 1;

  return score;
}

/**
 * Pick best asset deterministically (max score, tie-break by id).
 */
export function pickBestSlideshowAsset(
  criteria: SlideshowImageSelectionCriteria,
  layout: SlideshowLayoutVariant,
  assets: SlideshowImageAssetRecord[]
): SlideshowImageAssetRecord | null {
  if (!assets.length) return null;

  let best: SlideshowImageAssetRecord | null = null;
  let bestScore = -Infinity;

  for (const asset of assets) {
    const s = scoreSlideshowAssetMatch(criteria, layout, asset);
    if (s > bestScore || (s === bestScore && best && asset.id < best.id)) {
      bestScore = s;
      best = asset;
    }
  }

  return best;
}

/** If criteria match nothing well, fall back to best layout-fit then first id. */
export function resolveSlideAsset(
  criteria: SlideshowImageSelectionCriteria,
  layout: SlideshowLayoutVariant,
  assets: SlideshowImageAssetRecord[]
): SlideshowImageAssetRecord | null {
  const primary = pickBestSlideshowAsset(criteria, layout, assets);
  if (primary && scoreSlideshowAssetMatch(criteria, layout, primary) >= 0) {
    return primary;
  }

  const byFit = [...assets].sort((a, b) => {
    const fa = layout === "layout_a" ? a.layout_a_fit : a.layout_b_fit;
    const fb = layout === "layout_a" ? b.layout_a_fit : b.layout_b_fit;
    const na = fa ?? -1;
    const nb = fb ?? -1;
    if (nb !== na) return nb - na;
    return a.id.localeCompare(b.id);
  });

  return byFit[0] ?? primary ?? null;
}
