/**
 * Canonical output formats for dashboard generation + variant_metadata.output_format.
 * Internal template family for plain text-on-white cards: "square_text" and "engagement_text".
 */

export const MEME_OUTPUT_FORMATS = [
  "square_image",
  "square_video",
  "vertical_slideshow",
  "square_text",
] as const;

export type MemeOutputFormat = (typeof MEME_OUTPUT_FORMATS)[number];

export const MEME_TEMPLATE_FAMILIES = [
  "square_meme",
  "vertical_slideshow",
  "square_text",
  "engagement_text",
] as const;

export type MemeTemplateFamily = (typeof MEME_TEMPLATE_FAMILIES)[number];

export function isMemeOutputFormat(value: unknown): value is MemeOutputFormat {
  return (
    typeof value === "string" &&
    (MEME_OUTPUT_FORMATS as readonly string[]).includes(value)
  );
}
