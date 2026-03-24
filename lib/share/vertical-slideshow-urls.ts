type SlideshowMetaSlide = {
  image_url?: unknown;
};

/**
 * Slide image URLs for vertical slideshow outputs (matches workspace output panel).
 */
export function getVerticalSlideshowImageUrls(
  variantMetadata: Record<string, unknown> | null | undefined
): string[] {
  if (!variantMetadata || typeof variantMetadata !== "object") return [];
  const outputFormat = String(variantMetadata.output_format ?? "")
    .trim()
    .toLowerCase();
  if (outputFormat !== "vertical_slideshow") return [];

  const slides = Array.isArray(variantMetadata.slides)
    ? (variantMetadata.slides as SlideshowMetaSlide[])
    : [];
  return slides
    .map((slide) =>
      slide && typeof slide === "object"
        ? String(slide.image_url ?? "").trim()
        : ""
    )
    .filter(Boolean);
}
