export const HEIGHT_BUCKETS = ["short", "medium", "tall", "full"] as const;

export type HeightBucket = (typeof HEIGHT_BUCKETS)[number];

export interface MemeTemplate {
  id: string;
  name: string;
  height_bucket: HeightBucket;
}

export function normalizeHeightBucket(value: unknown): HeightBucket {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "short" || v === "medium" || v === "tall" || v === "full") {
    return v;
  }
  return "medium";
}
